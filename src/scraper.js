import puppeteer from 'puppeteer';
import ora from 'ora';
import { writeToCsv } from './csv.js';
import { getSitemapUrls } from './sitemap.js';
import { logProductDetails } from './utils.js';
import Queue from './queue.js';
import { getFilenameFromUrl } from './utils.js';
import { findChromePath } from './browser.js';
import * as cheerio from 'cheerio';
import axios from 'axios';

const DEFAULT_CONCURRENCY = 3; // Default number of concurrent browsers

// Add retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

// 商品数据选择器配置
const SELECTORS = {
    title: [
        '.product_title',
        '.entry-title',
        'h1.title',
        '[itemprop="name"]'
    ],
    price: [
        '.price',
        '.amount',
        '[itemprop="price"]',
        '.product-price'
    ],
    description: [
        '.woocommerce-product-details__short-description',
        '.description',
        '[itemprop="description"]',
        '#tab-description'
    ],
    sku: [
        '.sku',
        '[itemprop="sku"]',
        '.product_meta .sku'
    ],
    images: [
        '.woocommerce-product-gallery__image img',
        '.product-images img',
        '.images img'
    ],
    categories: [
        '.posted_in a',
        '.product-category a',
        '[rel="tag"]'
    ],
    attributes: [
        '.variations_form',
        '.product-attributes',
        '.woocommerce-product-attributes'
    ]
};

/**
 * 从页面中提取文本内容
 * @param {CheerioStatic} $ - Cheerio 实例
 * @param {string[]} selectors - 选择器数组
 * @returns {string} - 提取的文本
 */
function extractText($, selectors) {
    for (const selector of selectors) {
        const element = $(selector).first();
        if (element.length) {
            return element.text().trim();
        }
    }
    return '';
}

/**
 * 从页面中提取图片 URL
 * @param {CheerioStatic} $ - Cheerio 实例
 * @param {string[]} selectors - 选择器数组
 * @returns {string[]} - 图片 URL 数组
 */
function extractImages($, selectors) {
    const images = new Set();
    for (const selector of selectors) {
        $(selector).each((_, element) => {
            const src = $(element).attr('src') || $(element).attr('data-src');
            if (src) {
                images.add(src);
            }
        });
        if (images.size > 0) break;
    }
    return Array.from(images);
}

/**
 * 从页面中提取属性
 * @param {CheerioStatic} $ - Cheerio 实例
 * @param {string[]} selectors - 选择器数组
 * @returns {Object} - 属性对象
 */
function extractAttributes($, selectors) {
    const attributes = {};
    for (const selector of selectors) {
        const table = $(selector);
        if (table.length) {
            table.find('tr').each((_, row) => {
                const label = $(row).find('th').text().trim();
                const value = $(row).find('td').text().trim();
                if (label && value) {
                    attributes[label] = value;
                }
            });
            break;
        }
    }
    return attributes;
}

/**
 * 提取商品变体信息
 * @param {CheerioStatic} $ - Cheerio 实例
 * @returns {Object[]} - 变体数组
 */
function extractVariations($) {
    const variations = [];
    const form = $('.variations_form');
    
    if (form.length) {
        const variationsData = form.attr('data-product_variations');
        try {
            const parsed = JSON.parse(variationsData);
            return parsed.map(v => ({
                sku: v.sku || '',
                price: v.display_price || '',
                attributes: v.attributes || {}
            }));
        } catch (e) {
            console.warn('解析变体数据失败:', e.message);
        }
    }
    
    return variations;
}

/**
 * 从页面中提取商品数据
 * @param {string} url - 商品页面 URL
 * @returns {Promise<Object>} - 商品数据对象
 */
async function scrapeProduct(url) {
    try {
        console.log(`\n正在抓取商品: ${url}`);
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 基本信息
        const title = extractText($, SELECTORS.title);
        const price = extractText($, SELECTORS.price);
        const description = extractText($, SELECTORS.description);
        const sku = extractText($, SELECTORS.sku);
        
        // 图片
        const images = extractImages($, SELECTORS.images);
        
        // 分类
        const categories = [];
        $(SELECTORS.categories[0]).each((_, element) => {
            categories.push($(element).text().trim());
        });
        
        // 属性
        const attributes = extractAttributes($, SELECTORS.attributes);
        
        // 变体
        const variations = extractVariations($);

        const product = {
            url,
            title,
            price,
            description,
            sku,
            images: images.join(', '),
            categories: categories.join(', '),
            attributes: JSON.stringify(attributes),
            variations: JSON.stringify(variations)
        };

        console.log(`✓ 成功抓取商品: ${title}`);
        return product;
    } catch (error) {
        console.error(`抓取失败 [${url}]:`, error.message);
        return null;
    }
}

export async function scrapeWooCommerce(siteUrl, productLimit, concurrency = DEFAULT_CONCURRENCY) {
    console.log(`\n开始抓取网站: ${siteUrl}，使用 ${concurrency} 个并发浏览器`);
    if (productLimit !== Infinity) {
        console.log(`计划抓取商品数量: ${productLimit}`);
    }

    const spinner = ora('正在启动浏览器...').start();
    const browsers = [];

    try {
        spinner.text = '正在获取网站地图...';
        const productUrls = await getSitemapUrls(siteUrl);

        const urlsToScrape = productUrls.slice(0, productLimit);
        console.log(`\n找到 ${productUrls.length} 个商品，将抓取其中的 ${urlsToScrape.length} 个`);

        // 初始化队列和结果数组
        const queue = new Queue(urlsToScrape);
        const results = [];

        // 创建工作进程
        async function worker(workerId) {
            const browserPath = findChromePath();
            const launchOptions = {
                headless: 'new',
                protocolTimeout: 30000,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            };

            if (browserPath) {
                launchOptions.executablePath = browserPath;
                console.log(`使用系统浏览器: ${browserPath}`);
            }

            const browser = await puppeteer.launch(launchOptions);

            browsers.push(browser);
            const page = await browser.newPage();

            // Set default timeouts
            page.setDefaultNavigationTimeout(30000);
            page.setDefaultTimeout(30000);

            while (true) {
                const url = queue.next();
                if (!url) break;

                spinner.text = `工作进程 ${workerId}: 正在抓取商品 ${queue.processed}/${urlsToScrape.length}...`;
                console.log(`\n工作进程 ${workerId} 正在抓取: ${url}`);

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
                                                ora('使用方法:', method).spinner();
                                                
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
                                        console.log('使用方法:', method);
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
                                        console.log('使用方法:', method);
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
                                        console.log('使用方法:', method);
                                        variations = createVariationsFromAttributes(attributes);
                                        if (variations.length > 0) return variations;
                                    }
                                }

                                console.log('没有找到任何变体');
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
                        console.error(`工作进程 ${workerId} 出错 (尝试 ${attempts}/${RETRY_ATTEMPTS}) 抓取 ${url}:`, error.message);

                        if (attempts === RETRY_ATTEMPTS) {
                            console.error(`工作进程 ${workerId} 抓取 ${url} 失败`);
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
                console.error(`关闭浏览器出错 [工作进程 ${workerId}]:`, error.message);
            }
        }

        // Launch workers
        const workers = Array(concurrency).fill().map((_, i) => worker(i + 1));

        try {
            await Promise.all(workers);
        } catch (error) {
            console.error('工作进程池出错:', error);
        }

        // Ensure all browsers are closed
        for (const browser of browsers) {
            try {
                if (browser.isConnected()) {
                    await browser.close();
                }
            } catch (error) {
                console.error('关闭浏览器出错:', error.message);
            }
        }

        const filename = getFilenameFromUrl(siteUrl);
        await writeToCsv(results, filename);
        spinner.succeed(`成功抓取 ${results.length} 个商品！查看 ${filename}`);

    } catch (error) {
        spinner.fail('抓取过程中出错');
        console.error('错误详情:', error);

        // Cleanup on error
        for (const browser of browsers) {
            try {
                if (browser.isConnected()) {
                    await browser.close();
                }
            } catch (closeError) {
                console.error('关闭浏览器出错 [清理]:', closeError.message);
            }
        }

        throw error;
    }
}
