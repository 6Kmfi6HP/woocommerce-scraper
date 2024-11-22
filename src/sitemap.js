import { XMLParser } from 'fast-xml-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';

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
                console.log(`获取站点地图失败: ${url} (${response.status})`);
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
            console.log(`处理站点地图失败 ${url}:`, error.message);
            return [];
        }
    }

    // Process sitemap index
    async function processSitemapIndex(indexUrl) {
        try {
            const response = await fetch(indexUrl);
            if (!response.ok) {
                console.log(`获取站点地图索引失败: ${indexUrl} (${response.status})`);
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

            console.log('发现站点地图索引，正在处理子站点地图...');

            const allUrls = [];
            for (const sitemap of sitemaps) {
                if (sitemap.loc) {
                    console.log(`正在检查子站点地图: ${sitemap.loc}`);
                    const urls = await processSitemap(sitemap.loc);
                    if (urls.length > 0) {
                        console.log(`在子站点地图中发现 ${urls.length} 个商品 URL`);
                        allUrls.push(...urls);
                    }
                }
            }

            return allUrls;
        } catch (error) {
            console.log(`处理站点地图索引失败 ${indexUrl}:`, error.message);
            return [];
        }
    }

    // Try each possible sitemap location
    for (const location of sitemapLocations) {
        try {
            const fullUrl = siteUrl + location;
            console.log(`正在检查站点地图: ${fullUrl}`);

            const response = await fetch(fullUrl);
            if (!response.ok) {
                console.log(`站点地图不存在 ${location} (${response.status})`);
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
                    console.log(`在站点地图中发现 ${urls.length} 个商品 URL`);
                    productUrls.push(...urls);
                }
            }

            if (productUrls.length > 0) {
                console.log('\n发现商品 URL:');
                productUrls.slice(0, 3).forEach(url => console.log(`- ${url}`));
                if (productUrls.length > 3) {
                    console.log(`... 和另外 ${productUrls.length - 3} 个`);
                }
                break;
            }
        } catch (error) {
            console.log(`处理站点地图失败 ${location}:`, error.message);
            continue;
        }
    }

    if (productUrls.length === 0) {
        throw new Error('未找到任何商品 URL。请确保站点有一个包含商品 URL 的站点地图。');
    }

    // Remove duplicates and sort
    productUrls = [...new Set(productUrls)].sort();
    console.log(`\n总共发现 ${productUrls.length} 个唯一商品 URL`);

    return productUrls;
}

// Helper function to validate sitemap URL
export function validateSitemapUrl(url) {
    if (!url) {
        throw new Error('站点地图 URL 是必需的');
    }

    if (!url.startsWith('http')) {
        throw new Error('无效的站点地图 URL。必须以 http:// 或 https:// 开头');
    }

    return true;
}
