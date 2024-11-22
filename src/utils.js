export function cleanDescription(html) {
    if (!html) return '';

    try {
        // 移除脚本和样式标签及其内容
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                   .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

        // 移除 wc-tab-inner div
        html = html.replace(/<div class="wc-tab-inner">/g, '')
                   .replace(/<\/div>/g, ' ');

        // 清理换行和空格
        html = html.replace(/[\r\n]+/g, ' ')
                   .replace(/\s+/g, ' ');

        // 保护 <img> 标签，只保留 src 属性
        html = html.replace(/<img[^>]+>/g, match => {
            const src = match.match(/src="([^"]+)"/);
            return src ? `<img src="${src[1]}">` : '';
        });

        // 移除所有标签，除了 <p> 和 <img>
        html = html.replace(/<(?!\/?(p|img)(?=>|\s.*>))\/?[^>]*>/g, ' ');

        // 清理空格并添加换行
        html = html.replace(/>\s+</g, '><')
                   .replace(/<\/p>/g, '</p>\n')
                   .trim();

        // 移除空段落
        html = html.replace(/<p>\s*<\/p>/g, '');

        return html;
    } catch (error) {
        console.warn('清理描述时出错:', error.message);
        return html || '';
    }
}

export function extractTags(document) {
    const tags = new Set();

    // Find tags in common locations
    const tagElements = [
        ...document.querySelectorAll('.tagged_as a, .tags a, .product_tags a'),
        ...document.querySelectorAll('[rel="tag"]'),
        ...document.querySelectorAll('.product_meta a[href*="/tag/"]')
    ];

    tagElements.forEach(el => {
        const tag = el.textContent.trim();
        if (tag) tags.add(tag);
    });

    // Try regex patterns
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

export function logProductDetails(productData) {
    console.log('\n商品详情:');
    console.log(`名称: ${productData.name || '未找到'}`);
    console.log(`类型: ${productData.type}`);
    console.log(`常规价格: ${productData.regular_price || '未找到'}`);
    console.log(`分类: ${productData.categories.length ? productData.categories.join(', ') : '未找到'}`);
    console.log(`标签: ${productData.tags.length ? productData.tags.join(', ') : '未找到'}`);
    console.log(`找到图片数量: ${productData.images.length}`);
    console.log(productData);
    if (productData.type === 'variable' && productData.variations.length > 0) {
        logVariationDetails(productData.variations);
    }

    logDescriptions(productData);
    logMissingFields(productData);
}

function logDescriptions(productData) {
    console.log('\n商品描述:');
    if (productData.short_description) {
        console.log(`简短描述: (${productData.short_description.length} 字符)`);
        console.log(productData.short_description.substring(0, 150) + '...');
    } else {
        console.log('未找到简短描述');
    }

    if (productData.full_description) {
        console.log(`\n完整描述: (${productData.full_description.length} 字符)`);
        console.log(productData.full_description.substring(0, 150) + '...');
    } else {
        console.log('未找到完整描述');
    }
}

function logMissingFields(productData) {
    const missingFields = [];
    if (!productData.name) missingFields.push('名称');
    if (!productData.regular_price) missingFields.push('价格');
    if (productData.images.length === 0) missingFields.push('图片');

    if (missingFields.length > 0) {
        console.log('\n警告: 缺少字段:', missingFields.join(', '));
    }
}

export function logVariationDetails(variations) {
    console.log(`\n商品变体 (${variations.length}个):`);

    // 从第一个变体获取属性名称
    if (variations.length > 0) {
        const firstVariation = variations[0];
        const entries = Object.entries(firstVariation.attributes);
        if (entries.length > 0) {
            const [name] = entries[0];
            const attributeName = name.includes(' ') ? name.split(' ')[1] : name;
            console.log(`\n${attributeName}:`);
        }
    }

    // 列出所有值
    variations.forEach(variation => {
        if (variation.attributes) {
            const entries = Object.entries(variation.attributes);
            if (entries.length > 0) {
                const [, value] = entries[0];
                if (value) {
                    let index = variations.indexOf(variation) + 1;
                    console.log(`${index}: ${value}`);
                }
            }
        }
    });
}

export function getProductVariations(document) {
    const variations = [];
    const variationForm = document.querySelector('.variations_form');

    if (!variationForm) {
        return variations;
    }

    try {
        const jsonData = variationForm.getAttribute('data-product_variations');
        if (!jsonData || jsonData === 'false' || jsonData === '[]') {
            return variations;
        }

        const variationsData = JSON.parse(jsonData);
        if (!Array.isArray(variationsData)) {
            console.log('变体数据格式无效');
            return variations;
        }

        return variationsData.map(variation => {
            // 验证和清理变体数据
            const cleanVariation = {
                attributes: variation.attributes || {},
                price: variation.display_price || variation.price,
                sku: variation.sku || '',
                stock: variation.max_qty !== undefined ? variation.max_qty :
                    variation.stock_quantity !== undefined ? variation.stock_quantity : null
            };

            // 确保 attributes 是一个对象
            if (typeof cleanVariation.attributes !== 'object') {
                cleanVariation.attributes = {};
            }

            return cleanVariation;
        });
    } catch (e) {
        console.log('解析变体数据失败:', e.message);
        return variations;
    }
}

export function getFilenameFromUrl(url) {
    // 移除协议和 www
    let name = url.replace(/^https?:\/\/(www\.)?/, '');
    
    // 移除 TLD 和路径
    name = name.split('/')[0].split('.')[0];
    
    // 清理特殊字符
    name = name.replace(/[^a-z0-9]/gi, '-');
    
    // 添加时间戳
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    return `woocommerce-${name}-${timestamp}.csv`;
}
