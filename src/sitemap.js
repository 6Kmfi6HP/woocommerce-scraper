import { XMLParser } from 'fast-xml-parser';

export async function getSitemapUrls(siteUrl) {
    const parser = new XMLParser();
    const sitemapLocations = [
        '/sitemap.xml',
        // '/sitemap_index.xml',
        '/product-sitemap.xml',
        // '/wp-sitemap-posts-product-1.xml'
    ];

    let productUrls = [];

    // Helper function to check if URL is a product URL
    const isProductUrl = (url) => {
        // Exclude URLs with language codes (e.g. /es/, /fr/, etc)
        if (/\/[a-z]{2}\//.test(url)) {
            return false;
        }

        // Only keep URLs with /product/ path or /products/ path
        return url.includes('/product/') || url.includes('/products/');
    };

    // Process a single sitemap URL
    async function processSitemap(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.log(`Failed to fetch sitemap: ${url} (${response.status})`);
                return [];
            }

            const xmlText = await response.text();
            const result = parser.parse(xmlText);

            if (result.urlset && result.urlset.url) {
                const urls = Array.isArray(result.urlset.url)
                    ? result.urlset.url
                    : [result.urlset.url];

                return urls
                    .map(u => u.loc)
                    .filter(url => isProductUrl(url));
            }

            return [];
        } catch (error) {
            console.log(`Error processing sitemap ${url}:`, error.message);
            return [];
        }
    }

    // Process sitemap index
    async function processSitemapIndex(indexUrl) {
        try {
            const response = await fetch(indexUrl);
            if (!response.ok) {
                console.log(`Failed to fetch sitemap index: ${indexUrl} (${response.status})`);
                return [];
            }

            const xmlText = await response.text();
            const result = parser.parse(xmlText);

            if (!result.sitemapindex?.sitemap) {
                return [];
            }

            const sitemaps = Array.isArray(result.sitemapindex.sitemap)
                ? result.sitemapindex.sitemap
                : [result.sitemapindex.sitemap];

            console.log('Found sitemap index, processing sub-sitemaps...');

            const allUrls = [];
            for (const sitemap of sitemaps) {
                if (sitemap.loc) {
                    console.log(`Checking sub-sitemap: ${sitemap.loc}`);
                    const urls = await processSitemap(sitemap.loc);
                    if (urls.length > 0) {
                        console.log(`Found ${urls.length} product URLs in sub-sitemap`);
                        allUrls.push(...urls);
                    }
                }
            }

            return allUrls;
        } catch (error) {
            console.log(`Error processing sitemap index ${indexUrl}:`, error.message);
            return [];
        }
    }

    // Try each possible sitemap location
    for (const location of sitemapLocations) {
        try {
            const fullUrl = siteUrl + location;
            console.log(`Checking sitemap at: ${fullUrl}`);

            const response = await fetch(fullUrl);
            if (!response.ok) {
                console.log(`Sitemap not found at ${location} (${response.status})`);
                continue;
            }

            const xmlText = await response.text();
            const result = parser.parse(xmlText);

            // Handle sitemap index
            if (result.sitemapindex) {
                const indexUrls = await processSitemapIndex(fullUrl);
                if (indexUrls.length > 0) {
                    productUrls.push(...indexUrls);
                }
            }
            // Handle direct product sitemap
            else if (result.urlset) {
                const urls = await processSitemap(fullUrl);
                if (urls.length > 0) {
                    console.log(`Found ${urls.length} product URLs in sitemap at ${location}`);
                    productUrls.push(...urls);
                }
            }

            if (productUrls.length > 0) {
                console.log('\nProduct URLs found:');
                productUrls.slice(0, 3).forEach(url => console.log(`- ${url}`));
                if (productUrls.length > 3) {
                    console.log(`... and ${productUrls.length - 3} more`);
                }
                break;
            }
        } catch (error) {
            console.log(`Error processing sitemap at ${location}:`, error.message);
            continue;
        }
    }

    if (productUrls.length === 0) {
        throw new Error('No product URLs found in any sitemap. Make sure the site has a sitemap with product URLs.');
    }

    // Remove duplicates and sort
    productUrls = [...new Set(productUrls)].sort();
    console.log(`\nTotal unique product URLs found: ${productUrls.length}`);

    return productUrls;
}

// Helper function to validate sitemap URL
export function validateSitemapUrl(url) {
    if (!url) {
        throw new Error('Sitemap URL is required');
    }

    if (!url.startsWith('http')) {
        throw new Error('Invalid sitemap URL. Must start with http:// or https://');
    }

    return true;
}
