import { parseArgs } from './cli.js';
import { scrapeWooCommerce } from './scraper.js';

async function main() {
  const args = process.argv.slice(2);
  const { websiteUrl, maxProducts, concurrency } = await parseArgs(args);

  // Start scraping with parsed arguments
  await scrapeWooCommerce(websiteUrl, maxProducts, concurrency);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});