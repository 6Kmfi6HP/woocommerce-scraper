import puppeteer from 'puppeteer';
import { createObjectCsvWriter } from 'csv-writer';
import ora from 'ora';
import prompts from 'prompts';

async function scrapeWooCommerce() {
  const { siteUrl } = await prompts({
    type: 'text',
    name: 'siteUrl',
    message: 'Enter WooCommerce site URL (e.g., https://example.com):',
    validate: value => value.startsWith('http') ? true : 'Please enter a valid URL'
  });

  const spinner = ora('Starting browser...').start();
  
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    spinner.text = 'Accessing website...';
    await page.goto(`${siteUrl}/shop`, { waitUntil: 'networkidle0' });
    
    // Get all product URLs
    spinner.text = 'Collecting product URLs...';
    const productUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.product a.woocommerce-loop-product__link'))
        .map(el => el.href);
    });
    
    const products = [];
    
    // Scrape each product
    for (const [index, url] of productUrls.entries()) {
      spinner.text = `Scraping product ${index + 1}/${productUrls.length}...`;
      await page.goto(url, { waitUntil: 'networkidle0' });
      
      const productData = await page.evaluate(() => {
        const isVariable = document.querySelector('.variations_form') !== null;
        
        // Base product data
        const data = {
          type: isVariable ? 'variable' : 'simple',
          name: document.querySelector('.product_title')?.textContent?.trim(),
          description: document.querySelector('.woocommerce-product-details__short-description')?.innerHTML?.trim(),
          regular_price: document.querySelector('.price .amount')?.textContent?.replace(/[^0-9.]/g, ''),
          categories: Array.from(document.querySelectorAll('.posted_in a'))
            .map(el => el.textContent.trim()),
          images: Array.from(document.querySelectorAll('.woocommerce-product-gallery__image img'))
            .map(img => img.src),
          variations: []
        };
        
        // Get variations if present
        if (isVariable) {
          const variationForm = document.querySelector('.variations_form');
          const variationsData = JSON.parse(variationForm.getAttribute('data-product_variations'));
          
          data.variations = variationsData.map(variation => ({
            attributes: variation.attributes,
            price: variation.display_price,
            sku: variation.sku,
            stock: variation.max_qty
          }));
        }
        
        return data;
      });
      
      products.push(productData);
    }
    
    // Create CSV
    spinner.text = 'Generating CSV file...';
    const csvWriter = createObjectCsvWriter({
      path: 'woocommerce-products.csv',
      header: [
        { id: 'type', title: 'Type' },
        { id: 'name', title: 'Name' },
        { id: 'description', title: 'Description' },
        { id: 'regular_price', title: 'Regular price' },
        { id: 'categories', title: 'Categories' },
        { id: 'images', title: 'Images' },
        { id: 'variations', title: 'Variations' }
      ]
    });
    
    await csvWriter.writeRecords(products.map(product => ({
      ...product,
      categories: product.categories.join('|'),
      images: product.images.join('|'),
      variations: JSON.stringify(product.variations)
    })));
    
    await browser.close();
    spinner.succeed('Scraping completed! Check woocommerce-products.csv');
    
  } catch (error) {
    spinner.fail('Error occurred during scraping');
    console.error(error);
  }
}

scrapeWooCommerce();