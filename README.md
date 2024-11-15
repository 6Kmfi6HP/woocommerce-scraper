# WooCommerce Product Scraper

This tool allows you to scrape product data from any WooCommerce-powered website and export it to CSV format for easy import into another WooCommerce site.

## Features

- Scrapes products from any WooCommerce store
- Supports variable products with all variations
- Captures all product data (name, description, prices, images, etc.)
- Exports to CSV format compatible with WooCommerce import

## Usage

1. Run the scraper:
   ```bash
   npm start
   ```

2. Enter the WooCommerce site URL when prompted

3. The script will create a `woocommerce-products.csv` file containing all product data

## Import Instructions

1. Go to your WooCommerce admin panel
2. Navigate to Products → Import
3. Upload the generated CSV file
4. Follow the WooCommerce import wizard

## Data Collected

- Product name
- Description
- Regular price
- Categories
- Images
- Product type (simple/variable)
- Variations (for variable products)
  - Attributes
  - Prices
  - SKU
  - Stock