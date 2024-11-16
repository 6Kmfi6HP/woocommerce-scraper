export function cleanDescription(html) {
    if (!html) return '';

    // Remove wc-tab-inner div
    html = html.replace(/<div class="wc-tab-inner">/g, '')
        .replace(/<\/div>/g, ' ');

    // Clean up newlines and spaces
    html = html.replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ');

    // Protect <img> tags
    html = html.replace(/<img[^>]+>/g, match => {
        const src = match.match(/src="([^"]+)"/);
        return src ? `<img src="${src[1]}">` : '';
    });

    // Remove all tags except <p> and <img>
    html = html.replace(/<(?!\/?(p|img)(?=>|\s.*>))\/?[^>]*>/g, ' ');

    // Clean up spaces and add newlines
    html = html.replace(/\s+/g, ' ').trim();
    html = html.replace(/<\/p>/g, '</p>\n');

    return html.trim();
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
    console.log('\nProduct Details:');
    console.log(`Name: ${productData.name || 'Not found'}`);
    console.log(`Type: ${productData.type}`);
    console.log(`Regular Price: ${productData.regular_price || 'Not found'}`);
    console.log(`Categories: ${productData.categories.length ? productData.categories.join(', ') : 'None found'}`);
    console.log(`Tags: ${productData.tags.length ? productData.tags.join(', ') : 'None found'}`);
    console.log(`Images found: ${productData.images.length}`);
    console.log(productData);
    if (productData.type === 'variable' && productData.variations.length > 0) {
        logVariationDetails(productData.variations);
    }

    logDescriptions(productData);
    logMissingFields(productData);
}

function logDescriptions(productData) {
    console.log('\nDescriptions:');
    if (productData.short_description) {
        console.log(`Short Description: (${productData.short_description.length} chars)`);
        console.log(productData.short_description.substring(0, 150) + '...');
    } else {
        console.log('No short description found');
    }

    if (productData.full_description) {
        console.log(`\nFull Description: (${productData.full_description.length} chars)`);
        console.log(productData.full_description.substring(0, 150) + '...');
    } else {
        console.log('No full description found');
    }
}

function logMissingFields(productData) {
    const missingFields = [];
    if (!productData.name) missingFields.push('name');
    if (!productData.regular_price) missingFields.push('price');
    if (productData.images.length === 0) missingFields.push('images');

    if (missingFields.length > 0) {
        console.log('\nWarning: Missing fields:', missingFields.join(', '));
    }
}

export function logVariationDetails(variations) {
    console.log(`\nVariations (${variations.length}):`);

    // Get the attribute name from the first variation
    if (variations.length > 0) {
        const firstVariation = variations[0];
        const entries = Object.entries(firstVariation.attributes);
        if (entries.length > 0) {
            const [name] = entries[0];
            const attributeName = name.includes(' ') ? name.split(' ')[1] : name;
            console.log(`\n${attributeName}:`);
        }
    }

    // List all values
    variations.forEach(variation => {
        if (variation.attributes) {
            const entries = Object.entries(variation.attributes);
            if (entries.length > 0) {
                const [, value] = entries[0];
                if (value) {
                    // console.log(`\nVariation #${variations.indexOf(variation) + 1}`);
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
            console.log('Invalid variations data format');
            return variations;
        }

        return variationsData.map(variation => {
            // Validate and clean variation data
            const cleanVariation = {
                attributes: variation.attributes || {},
                price: variation.display_price || variation.price,
                sku: variation.sku || '',
                stock: variation.max_qty !== undefined ? variation.max_qty :
                    variation.stock_quantity !== undefined ? variation.stock_quantity : null
            };

            // Ensure attributes is an object
            if (typeof cleanVariation.attributes !== 'object') {
                cleanVariation.attributes = {};
            }

            return cleanVariation;
        });
    } catch (e) {
        console.log('Failed to parse variation data:', e.message);
        return variations;
    }
}

export function getFilenameFromUrl(url) {
    // Remove protocol and www
    let name = url.replace(/^https?:\/\/(www\.)?/, '');
    
    // Remove TLD and path
    name = name.split('/')[0].split('.')[0];
    
    // Clean special characters
    name = name.replace(/[^a-z0-9]/gi, '-');
    
    // Add timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    return `woocommerce-${name}-${timestamp}.csv`;
}
