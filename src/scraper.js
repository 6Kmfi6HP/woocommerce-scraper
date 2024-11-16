import puppeteer from 'puppeteer';
import ora from 'ora';
import { writeToCsv } from './csv.js';
import { getSitemapUrls } from './sitemap.js';
import { logProductDetails } from './utils.js';
import Queue from './queue.js';
import { getFilenameFromUrl } from './utils.js';

const DEFAULT_CONCURRENCY = 3; // Default number of concurrent browsers

// Add retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

export async function scrapeWooCommerce(siteUrl, productLimit, concurrency = DEFAULT_CONCURRENCY) {
    console.log(`\nStarting scrape of: ${siteUrl} with ${concurrency} concurrent browsers`);
    if (productLimit !== Infinity) {
        console.log(`Will scrape up to ${productLimit} products`);
    }

    const spinner = ora('Starting browser...').start();
    const browsers = [];

    try {
        spinner.text = 'Fetching sitemap...';
        const productUrls = await getSitemapUrls(siteUrl);

        const urlsToScrape = productUrls.slice(0, productLimit);
        console.log(`Will scrape ${urlsToScrape.length} out of ${productUrls.length} available products`);

        // Initialize queue and results array
        const queue = new Queue(urlsToScrape);
        const results = [];

        // Create worker function
        async function worker(workerId) {
            const browser = await puppeteer.launch({
                headless: 'new',
                protocolTimeout: 30000, // 30 second protocol timeout
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });

            browsers.push(browser);
            const page = await browser.newPage();

            // Set default timeouts
            page.setDefaultNavigationTimeout(30000);
            page.setDefaultTimeout(30000);

            while (true) {
                const url = queue.next();
                if (!url) break;

                spinner.text = `Worker ${workerId}: Scraping product ${queue.processed}/${urlsToScrape.length}...`;
                console.log(`\nWorker ${workerId} scraping: ${url}`);

                // Add retry logic
                let attempts = 0;
                while (attempts < RETRY_ATTEMPTS) {
                    try {
                        await page.goto(url, {
                            waitUntil: 'networkidle0',
                            timeout: 30000
                        });

                        const productData = await page.evaluate(() => {
                            const isVariable = document.querySelector('.variations_form') !== null;

                            // Internal helper function to extract tags
                            function extractTags() {
                                const tags = new Set();

                                const tagElements = [
                                    ...document.querySelectorAll('.tagged_as a, .tags a, .product_tags a'),
                                    ...document.querySelectorAll('[rel="tag"]'),
                                    ...document.querySelectorAll('.product_meta a[href*="/tag/"]')
                                ];

                                tagElements.forEach(el => {
                                    const tag = el.textContent.trim();
                                    if (tag) tags.add(tag);
                                });

                                const patterns = [
                                    /<a[^>]*\/tag\/([^"]+)"[^>]*>([^<]+)<\/a>/g,
                                    /<span[^>]*tagged_as[^>]*>(Tags:|Tagged:)?([^<]+)<\/span>/g,
                                    /<meta[^>]*name="keywords"[^>]*content="([^"]+)"/g
                                ];

                                const htmlContent = document.documentElement.innerHTML;

                                patterns.forEach(pattern => {
                                    let matches;
                                    while ((matches = pattern.exec(htmlContent)) !== null) {
                                        if (matches[2]) {
                                            matches[2].split(',')
                                                .map(tag => tag.trim())
                                                .filter(tag => tag)
                                                .forEach(tag => tags.add(tag));
                                        } else if (matches[1]) {
                                            matches[1].split(',')
                                                .map(tag => tag.trim())
                                                .filter(tag => tag)
                                                .forEach(tag => tags.add(tag));
                                        }
                                    }
                                });

                                return Array.from(tags);
                            }

                            // Internal helper function to clean HTML
                            function cleanDescription(html) {
                                if (!html) return '';

                                // Remove wc-tab-inner div
                                html = html.replace(/<div class="wc-tab-inner">/g, '')
                                    .replace(/<\/div>/g, ' ');

                                // Clean up whitespace and newlines
                                html = html.replace(/[\r\n]+/g, ' ')
                                    .replace(/\s+/g, ' ');

                                // Clean up img tags to only keep src attribute
                                html = html.replace(/<img[^>]+>/g, match => {
                                    const src = match.match(/src="([^"]+)"/);
                                    return src ? `<img src="${src[1]}">` : '';
                                });

                                // Remove all HTML tags except p and img
                                html = html.replace(/<(?!\/?(?:p|img)(?:\s[^>]*)?>)[^>]+>/g, ' ');

                                // Clean up extra spaces
                                html = html.replace(/\s+/g, ' ').trim();

                                // Add newline after closing p tags for better formatting
                                html = html.replace(/<\/p>/g, '</p>\n');

                                return html.trim();
                            }

                            // Internal helper function to get descriptions
                            function getDescriptions() {
                                const descriptions = {
                                    short_description: '',
                                    full_description: ''
                                };

                                const shortDescSelectors = [
                                    '.woocommerce-product-details__short-description',
                                    '.product-short-description',
                                    '[itemprop="description"]'
                                ];

                                for (const selector of shortDescSelectors) {
                                    const element = document.querySelector(selector);
                                    if (element) {
                                        descriptions.short_description = cleanDescription(element.innerHTML);
                                        break;
                                    }
                                }

                                const fullDescSelectors = [
                                    '#tab-description',
                                    '.woocommerce-Tabs-panel--description',
                                    '.woocommerce-product-content',
                                    '.product-description'
                                ];

                                for (const selector of fullDescSelectors) {
                                    const element = document.querySelector(selector);
                                    if (element) {
                                        descriptions.full_description = cleanDescription(element.innerHTML);
                                        break;
                                    }
                                }

                                return descriptions;
                            }

                            // 1. Helper function to create all possible combinations of variations
                            function createVariations(attrs) {
                                const keys = Object.keys(attrs);
                                if (keys.length === 0) return [{}];
                                
                                const key = keys[0];
                                const values = attrs[key];
                                const rest = { ...attrs };
                                delete rest[key];
                                
                                const subVariations = createVariations(rest);
                                const variations = [];
                                
                                values.forEach(value => {
                                    subVariations.forEach(subVar => {
                                        variations.push({
                                            ...subVar,
                                            [key]: value
                                        });
                                    });
                                });
                                
                                return variations;
                            }

                            // 2. Helper function to create variation objects with attributes
                            function createVariationsFromAttributes(attributes, variationData = null) {
                                const basePrice = document.querySelector('.price .amount')?.textContent?.replace(/[^0-9.]/g, '') || '';
                                const combinations = createVariations(attributes);
                                
                                return combinations.map(combo => {
                                    // If we have variation data, try to find matching variation
                                    if (variationData) {
                                        const matchingVariation = variationData.find(v => {
                                            return Object.keys(combo).every(key => 
                                                v.attributes[`attribute_${key}`] === combo[key]
                                            );
                                        });
                                        
                                        if (matchingVariation) {
                                            return {
                                                attributes: combo,
                                                price: matchingVariation.display_price || basePrice,
                                                sku: matchingVariation.sku || '',
                                                stock: matchingVariation.is_in_stock ? 'instock' : 'outofstock',
                                                variation_id: matchingVariation.variation_id
                                            };
                                        }
                                    }
                                    
                                    // Default variation object if no matching data found
                                    return {
                                        attributes: combo,
                                        price: basePrice,
                                        sku: '',
                                        stock: null
                                    };
                                });
                            }

                            // 3. Main function to get product variations
                            function getProductVariations() {
                                let method = '';
                                let variations = [];
                                
                                // Method 1: Try to get variations from data-product_variations
                                const variationForm = document.querySelector('.variations_form');
                                if (variationForm) {
                                    try {
                                        const jsonData = variationForm.getAttribute('data-product_variations');
                                        if (jsonData && jsonData !== '[]' && jsonData !== 'false') {
                                            const decodedJson = jsonData.replace(/&quot;/g, '"')
                                                .replace(/&lt;/g, '<')
                                                .replace(/&gt;/g, '>')
                                                .replace(/&amp;/g, '&');
                                            
                                            const variationsData = JSON.parse(decodedJson);
                                            if (Array.isArray(variationsData) && variationsData.length > 0) {
                                                method = 'data-product_variations';
                                                ora('Using method:', method).spinner();
                                                
                                                // Get all unique attribute names
                                                const attributeNames = new Set();
                                                variationsData.forEach(variation => {
                                                    if (variation.attributes) {
                                                        Object.keys(variation.attributes).forEach(attr => {
                                                            attributeNames.add(attr.replace('attribute_', ''));
                                                        });
                                                    }
                                                });

                                                // Build attributes object
                                                const attributes = {};
                                                attributeNames.forEach(attrName => {
                                                    const values = new Set();
                                                    variationsData.forEach(variation => {
                                                        if (variation.attributes && variation.attributes[`attribute_${attrName}`]) {
                                                            values.add(variation.attributes[`attribute_${attrName}`]);
                                                        }
                                                    });
                                                    if (values.size > 0) {
                                                        attributes[attrName] = Array.from(values);
                                                    }
                                                });

                                                variations = createVariationsFromAttributes(attributes, variationsData);
                                                if (variations.length > 0) return variations;
                                            }
                                        }
                                    } catch (e) {
                                        console.log('Failed to parse data-product_variations:', e.message);
                                    }
                                }

                                // Method 2: Try to find variations from additional information table
                                const additionalInfoTable = document.querySelector('.woocommerce-product-attributes.shop_attributes');
                                if (additionalInfoTable) {
                                    const attributes = {};
                                    let hasValidOptions = false;

                                    additionalInfoTable.querySelectorAll('tr.woocommerce-product-attributes-item').forEach(row => {
                                        const label = row.querySelector('.wd-attr-name-label')?.textContent?.trim();
                                        const valueCell = row.querySelector('.woocommerce-product-attributes-item__value');
                                        
                                        if (label && valueCell) {
                                            const options = Array.from(valueCell.querySelectorAll('.wd-attr-term p'))
                                                .map(p => p.textContent.trim())
                                                .filter(text => text);

                                            if (options.length > 0) {
                                                attributes[label.toLowerCase()] = options;
                                                hasValidOptions = true;
                                            }
                                        }
                                    });

                                    if (hasValidOptions) {
                                        method = 'additional_information';
                                        console.log('Using method:', method);
                                        variations = createVariationsFromAttributes(attributes);
                                        if (variations.length > 0) return variations;
                                    }
                                }

                                // Method 3: Try to find variations from variations table
                                const variationsTable = document.querySelector('table.variations');
                                if (variationsTable) {
                                    const attributes = {};
                                    let hasValidOptions = false;

                                    variationsTable.querySelectorAll('tr').forEach(row => {
                                        const label = row.querySelector('th.label label')?.textContent?.trim();
                                        const select = row.querySelector('select');

                                        if (label && select) {
                                            const options = Array.from(select.options)
                                                .filter(option => option.value && option.value !== 'Choose an option')
                                                .map(option => option.textContent.trim());

                                            if (options.length > 0) {
                                                attributes[label.toLowerCase()] = options;
                                                hasValidOptions = true;
                                            }
                                        }
                                    });

                                    if (hasValidOptions) {
                                        method = 'variations_table';
                                        console.log('Using method:', method);
                                        variations = createVariationsFromAttributes(attributes);
                                        if (variations.length > 0) return variations;
                                    }
                                }

                                // Method 4: Try to find variations from select elements
                                const selects = document.querySelectorAll('select[name^="attribute_"]');
                                if (selects.length > 0) {
                                    const attributes = {};
                                    let hasValidOptions = false;

                                    selects.forEach(select => {
                                        const attributeName = select.name.replace('attribute_', '');
                                        const options = Array.from(select.options)
                                            .filter(option => option.value && option.value !== 'Choose an option')
                                            .map(option => option.textContent.trim());

                                        if (options.length > 0) {
                                            attributes[attributeName] = options;
                                            hasValidOptions = true;
                                        }
                                    });

                                    if (hasValidOptions) {
                                        method = 'select_elements';
                                        console.log('Using method:', method);
                                        variations = createVariationsFromAttributes(attributes);
                                        if (variations.length > 0) return variations;
                                    }
                                }

                                console.log('No variations found using any method');
                                return [];
                            }

                            // Get base product data
                            const data = {
                                type: isVariable ? 'variable' : 'simple',
                                name: document.querySelector('.product_title')?.textContent?.trim(),
                                regular_price: document.querySelector('.price .amount')?.textContent?.replace(/[^0-9.]/g, ''),
                                categories: Array.from(document.querySelectorAll('.posted_in a'))
                                    .map(el => el.textContent.trim()),
                                images: (() => {
                                    const imageUrls = new Set();
                                    
                                    // Helper to get highest quality image from srcset
                                    function getBestImageFromSrcset(srcset) {
                                        if (!srcset) return null;
                                        const sources = srcset.split(',')
                                            .map(src => {
                                                const [url, width] = src.trim().split(' ');
                                                return {
                                                    url: url,
                                                    width: width ? parseInt(width) : 0
                                                };
                                            })
                                            .sort((a, b) => b.width - a.width);
                                        return sources.length ? sources[0].url : null;
                                    }

                                    // Helper to clean image URL
                                    function cleanImageUrl(url) {
                                        if (!url) return null;
                                        return url.trim()
                                            .replace(/^\/\//, 'https://') // Fix protocol-relative URLs
                                            .replace(/\?.*$/, ''); // Remove query parameters
                                    }

                                    // Find all product images using multiple selectors
                                    const imageSelectors = [
                                        '.woocommerce-product-gallery__image img',
                                        '.woocommerce-product-gallery img',
                                        '.wp-post-image',
                                        '.wvg-post-image',
                                        '.product-images img',
                                        '.product-gallery img',
                                        '.flex-control-thumbs img',
                                        '.thumbnails img'
                                    ];

                                    document.querySelectorAll(imageSelectors.join(',')).forEach(img => {
                                        // Check all possible image sources in priority order
                                        const sources = [
                                            img.getAttribute('data-large_image'),  // WooCommerce large image
                                            getBestImageFromSrcset(img.getAttribute('srcset')),  // Largest from srcset
                                            img.getAttribute('data-src'),  // Lazy loading source
                                            img.src  // Default source
                                        ];

                                        // Add all valid image URLs to the set
                                        sources.forEach(src => {
                                            const cleanUrl = cleanImageUrl(src);
                                            if (cleanUrl && cleanUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i)) {
                                                imageUrls.add(cleanUrl);
                                            }
                                        });
                                    });
                                    
                                    return Array.from(imageUrls);
                                })(),
                                tags: extractTags(),
                                variations: []
                            };

                            // Get descriptions
                            const descriptions = getDescriptions();
                            data.short_description = descriptions.short_description;
                            data.full_description = descriptions.full_description;

                            // Handle variations if present
                            if (isVariable) {
                                data.variations = getProductVariations();
                            }

                            return data;
                        });

                        logProductDetails(productData);
                        results.push(productData);
                        break; // Success - exit retry loop

                    } catch (error) {
                        attempts++;
                        console.error(`Worker ${workerId} error (attempt ${attempts}/${RETRY_ATTEMPTS}) scraping ${url}:`, error.message);

                        if (attempts === RETRY_ATTEMPTS) {
                            console.error(`Worker ${workerId} failed to scrape ${url} after ${RETRY_ATTEMPTS} attempts`);
                            break;
                        }

                        // Wait before retrying
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    }
                }
            }

            // Close page and browser for this worker
            try {
                await page.close();
                await browser.close();
            } catch (error) {
                console.error(`Error closing browser for worker ${workerId}:`, error.message);
            }
        }

        // Launch workers
        const workers = Array(concurrency).fill().map((_, i) => worker(i + 1));

        try {
            await Promise.all(workers);
        } catch (error) {
            console.error('Error in worker pool:', error);
        }

        // Ensure all browsers are closed
        for (const browser of browsers) {
            try {
                if (browser.isConnected()) {
                    await browser.close();
                }
            } catch (error) {
                console.error('Error closing browser:', error.message);
            }
        }

        const filename = getFilenameFromUrl(siteUrl);
        await writeToCsv(results, filename);
        spinner.succeed(`Successfully scraped ${results.length} products! Check ${filename}`);

    } catch (error) {
        spinner.fail('Error occurred during scraping');
        console.error('Detailed error:', error);

        // Cleanup on error
        for (const browser of browsers) {
            try {
                if (browser.isConnected()) {
                    await browser.close();
                }
            } catch (closeError) {
                console.error('Error closing browser during cleanup:', closeError.message);
            }
        }

        throw error;
    }
}
