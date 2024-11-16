import prompts from 'prompts';

const DEFAULT_CONCURRENCY = 5;

const usage = `
Usage: woocommerce-scraper <website-url> [options]

Arguments:
  website-url             Target WooCommerce website URL (required)

Options:
  --limit <number>        Maximum number of products to scrape
  --concurrency <number>  Number of concurrent browsers (default: 3)
  -h, --help             Show this help message

Example:
  woocommerce-scraper https://example.com --limit 100 --concurrency 5
`;

export async function parseArgs(args) {
  // Show help if requested
  if (args.includes('-h') || args.includes('--help')) {
    console.log(usage);
    process.exit(0);
  }

  let websiteUrl, maxProducts, concurrency;

  // Try to parse command line arguments first
  if (args.length > 0) {
    websiteUrl = args[0];
    const limitIndex = args.findIndex(arg => arg === '--limit');
    maxProducts = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : Infinity;
    const concurrencyIndex = args.findIndex(arg => arg === '--concurrency');
    concurrency = concurrencyIndex !== -1 ? parseInt(args[concurrencyIndex + 1]) : DEFAULT_CONCURRENCY;

    try {
      validateArgs(websiteUrl, limitIndex, maxProducts, concurrencyIndex, concurrency);
      return { websiteUrl, maxProducts, concurrency };
    } catch (error) {
      console.log('Invalid command line arguments:', error.message);
      console.log('Switching to interactive mode...\n');
    }
  }

  // If no valid command line args, use interactive prompts
  const response = await prompts([
    {
      type: 'text',
      name: 'websiteUrl',
      message: '请输入要抓取的WooCommerce网站地址:',
      validate: value => {
        if (!value) return '网站地址不能为空';
        if (!value.startsWith('http')) return '网址必须以http://或https://开头';
        return true;
      }
    },
    {
      type: 'number',
      name: 'maxProducts',
      message: '要抓取的最大商品数量 (输入0表示无限制):',
      initial: 0
    },
    {
      type: 'number',
      name: 'concurrency',
      message: '同时运行的浏览器数量:',
      initial: DEFAULT_CONCURRENCY,
      validate: value => {
        if (value < 1) return '必须大于0';
        return true;
      }
    }
  ]);

  return {
    websiteUrl: response.websiteUrl,
    maxProducts: response.maxProducts === 0 ? Infinity : response.maxProducts,
    concurrency: response.concurrency
  };
}

export function validateArgs(websiteUrl, limitIndex, maxProducts, concurrencyIndex, concurrency) {
  if (!websiteUrl) {
    throw new Error('Website URL is required');
  }

  if (!websiteUrl.startsWith('http')) {
    throw new Error('Invalid URL. Must start with http:// or https://');
  }

  if (limitIndex !== -1 && isNaN(maxProducts)) {
    throw new Error('--limit must be a number');
  }

  if (concurrencyIndex !== -1 && isNaN(concurrency)) {
    throw new Error('--concurrency must be a number');
  }
}
