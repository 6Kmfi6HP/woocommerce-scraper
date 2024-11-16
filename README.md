# WooCommerce Product Scraper

This tool allows you to scrape product data from any WooCommerce-powered website and export it to CSV format for easy import into another WooCommerce site.

## Installation

### Using pre-built binaries

1. Download the latest release for your platform from the Releases page
2. Extract the archive
3. Run the executable from terminal/command prompt

### Building from source

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build binaries:
   ```bash 
   npm run build
   ```
   This will create executables in the dist/ directory for Windows, Mac and Linux.

## Usage

### Using binary

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