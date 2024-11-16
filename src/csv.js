import { createObjectCsvWriter } from 'csv-writer';

export async function writeToCsv(products, filename) {
  // First pass - determine max number of attributes
  let maxAttributes = 0;
  products.forEach(product => {
    if (product?.type === 'variable' && Array.isArray(product?.variations) && product.variations.length > 0) {
      const firstVar = product.variations[0];
      const attrCount = firstVar?.attributes ? Object.keys(firstVar.attributes).length : 0;
      maxAttributes = Math.max(maxAttributes, attrCount);
    }
  });

  // Generate headers
  const headers = [
    { id: 'id', title: 'ID' },
    { id: 'type', title: 'Type' },
    { id: 'sku', title: 'SKU' },
    { id: 'name', title: 'Name' },
    { id: 'published', title: 'Published' },
    { id: 'featured', title: 'Is featured?' },
    { id: 'visibility', title: 'Visibility in catalog' },
    { id: 'description', title: 'Description' },
    { id: 'tax_status', title: 'Tax status' },
    { id: 'in_stock', title: 'In stock?' },
    { id: 'stock', title: 'Stock' },
    { id: 'categories', title: 'Categories' },
    { id: 'tags', title: 'Tags' },
    { id: 'images', title: 'Images' },
    { id: 'parent', title: 'Parent' },
    { id: 'position', title: 'Position' },
    { id: 'regular_price', title: 'Regular price' },
  ];

  // Add attribute headers based on actual max attributes found
  for (let i = 1; i <= maxAttributes; i++) {
    headers.push(
      { id: `attribute${i}_name`, title: `Attribute ${i} name` },
      { id: `attribute${i}_values`, title: `Attribute ${i} value(s)` },
      { id: `attribute${i}_visible`, title: `Attribute ${i} visible` },
      { id: `attribute${i}_global`, title: `Attribute ${i} global` }
    );
  }

  const csvWriter = createObjectCsvWriter({
    path: filename,
    header: headers
  });

  const csvRows = [];
  let currentId = 1000;

  products.forEach((product, index) => {
    // Ensure product is defined and has required properties
    if (!product) return;

    const baseSkuId = (product.name || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 15);
    
    if (product.type === 'variable' && Array.isArray(product.variations) && product.variations.length > 0) {
      const firstVar = product.variations[0];
      const attributeNames = firstVar?.attributes ? Object.keys(firstVar.attributes) : [];
      
      // Parent row
      const baseRow = {
        id: currentId,
        type: 'variable',
        sku: baseSkuId,
        name: product.name || '',
        published: '1',
        featured: '0',
        visibility: 'visible',
        description: product.full_description || '',
        tax_status: 'taxable',
        in_stock: '1',
        stock: '1000',
        categories: Array.isArray(product.categories) ? product.categories.join(', ') : '',
        tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
        images: Array.isArray(product.images) ? product.images.join(',') : '',
        parent: '',
        position: '0',
        regular_price: ''
      };

      // Initialize all attribute fields based on max attributes
      for (let i = 1; i <= maxAttributes; i++) {
        baseRow[`attribute${i}_name`] = '';
        baseRow[`attribute${i}_values`] = '';
        baseRow[`attribute${i}_visible`] = '';
        baseRow[`attribute${i}_global`] = '';
      }

      // Fill in actual attributes
      attributeNames.forEach((attrName, idx) => {
        if (!attrName) return;

        const allValues = product.variations
          .map(v => v?.attributes?.[attrName])
          .filter(v => v) // Remove null/undefined values
          .filter((v, i, arr) => arr.indexOf(v) === i) // Remove duplicates
          .join(', ');

        baseRow[`attribute${idx + 1}_name`] = attrName;
        baseRow[`attribute${idx + 1}_values`] = allValues;
        baseRow[`attribute${idx + 1}_visible`] = '1';
        baseRow[`attribute${idx + 1}_global`] = idx === 0 ? '1' : '0';
      });

      csvRows.push(baseRow);
      const parentId = currentId;
      currentId++;

      // Variation rows
      product.variations.forEach((variation, varIndex) => {
        if (!variation) return;

        const attrValues = variation.attributes ? Object.values(variation.attributes) : [];
        const varSku = `${baseSkuId}-${attrValues.join('-').replace(/\s+/g, '')}`;
        const varName = `${product.name || ''} - ${attrValues.join(' ')}`;

        const varRow = {
          id: currentId,
          type: 'variation',
          sku: varSku,
          name: varName,
          published: '1',
          featured: '0',
          visibility: 'visible',
          description: '',
          tax_status: 'taxable',
          in_stock: '1',
          stock: '1000',
          categories: '',
          tags: '',
          images: variation.image || '',
          parent: `id:${parentId}`,
          position: varIndex + 1,
          regular_price: variation.price || ''
        };

        // Initialize all attribute fields based on max attributes
        for (let i = 1; i <= maxAttributes; i++) {
          varRow[`attribute${i}_name`] = '';
          varRow[`attribute${i}_values`] = '';
          varRow[`attribute${i}_visible`] = '';
          varRow[`attribute${i}_global`] = '';
        }

        // Fill in actual attributes
        if (variation.attributes) {
          Object.entries(variation.attributes).forEach(([name, value], idx) => {
            if (!name || !value) return;
            
            varRow[`attribute${idx + 1}_name`] = name;
            varRow[`attribute${idx + 1}_values`] = value;
            varRow[`attribute${idx + 1}_visible`] = '1';
            varRow[`attribute${idx + 1}_global`] = '1';
          });
        }

        csvRows.push(varRow);
        currentId++;
      });
    } else {
      // Simple product
      const row = {
        id: currentId,
        type: 'simple',
        sku: baseSkuId,
        name: product.name || '',
        published: '1',
        featured: '0',
        visibility: 'visible',
        description: product.full_description || '',
        tax_status: 'taxable',
        in_stock: '1',
        stock: '1000',
        categories: Array.isArray(product.categories) ? product.categories.join(', ') : '',
        tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
        images: Array.isArray(product.images) ? product.images.join(',') : '',
        parent: '',
        position: '0',
        regular_price: product.regular_price || ''
      };

      // Add empty attribute columns based on max attributes
      for (let i = 1; i <= maxAttributes; i++) {
        row[`attribute${i}_name`] = '';
        row[`attribute${i}_values`] = '';
        row[`attribute${i}_visible`] = '';
        row[`attribute${i}_global`] = '';
      }

      csvRows.push(row);
      currentId++;
    }
  });

  await csvWriter.writeRecords(csvRows);
}
