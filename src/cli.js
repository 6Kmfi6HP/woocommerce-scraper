import prompts from 'prompts';

const DEFAULT_CONCURRENCY = 5;

const usage = `
使用方法: woocommerce-scraper <网站地址> [选项]

参数:
  网站地址             目标 WooCommerce 网站的 URL (必需)

选项:
  --limit <数字>       要抓取的最大商品数量
  --concurrency <数字> 同时运行的浏览器数量 (默认: 3)
  -h, --help          显示帮助信息

示例:
  woocommerce-scraper https://example.com --limit 100 --concurrency 5
`;

export async function parseArgs(args) {
  // 显示帮助信息
  if (args.includes('-h') || args.includes('--help')) {
    console.log(usage);
    process.exit(0);
  }

  let websiteUrl, maxProducts, concurrency;

  // 首先尝试解析命令行参数
  if (args.length > 0) {
    websiteUrl = args[0];
    const limitIndex = args.findIndex(arg => arg === '--limit');
    maxProducts = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : Infinity;
    const concurrencyIndex = args.findIndex(arg => arg === '--concurrency');
    concurrency = concurrencyIndex !== -1 ? parseInt(args[concurrencyIndex + 1]) : DEFAULT_CONCURRENCY;

    try {
      validateArgs(websiteUrl, limitIndex, maxProducts, concurrencyIndex, concurrency);
      return { 
        websiteUrl: websiteUrl.replace(/\/+$/, ''),
        maxProducts, 
        concurrency 
      };
    } catch (error) {
      console.log('命令行参数无效:', error.message);
      console.log('切换到交互模式...\n');
    }
  }

  // 如果没有有效的命令行参数，使用交互式提示
  const response = await prompts([
    {
      type: 'text',
      name: 'websiteUrl',
      message: '请输入要抓取的 WooCommerce 网站地址:',
      validate: value => {
        if (!value) return '网站地址不能为空';
        if (!value.startsWith('http')) return '网址必须以 http:// 或 https:// 开头';
        return true;
      }
    },
    {
      type: 'text',
      name: 'maxProducts',
      message: '要抓取的最大商品数量 (输入 0 表示无限制):',
      initial: '0',
      validate: value => {
        const num = parseInt(value);
        if (isNaN(num)) return '请输入有效的数字';
        if (num < 0) return '数量不能为负数';
        return true;
      }
    },
    {
      type: 'number',
      name: 'concurrency',
      message: '同时运行的浏览器数量:',
      initial: DEFAULT_CONCURRENCY,
      validate: value => {
        if (value < 1) return '浏览器数量必须大于 0';
        if (value > 10) return '为了系统稳定，建议不要超过 10 个浏览器';
        return true;
      }
    }
  ]);

  return {
    websiteUrl: response.websiteUrl.replace(/\/+$/, ''),
    maxProducts: parseInt(response.maxProducts) === 0 ? Infinity : parseInt(response.maxProducts),
    concurrency: response.concurrency
  };
}

export function validateArgs(websiteUrl, limitIndex, maxProducts, concurrencyIndex, concurrency) {
  if (!websiteUrl) {
    throw new Error('缺少网站地址');
  }

  if (!websiteUrl.startsWith('http')) {
    throw new Error('无效的网址，必须以 http:// 或 https:// 开头');
  }

  if (limitIndex !== -1 && isNaN(maxProducts)) {
    throw new Error('--limit 参数必须是数字');
  }

  if (concurrencyIndex !== -1) {
    if (isNaN(concurrency)) {
      throw new Error('--concurrency 参数必须是数字');
    }
    if (concurrency > 10) {
      console.warn('警告: 并发数过高可能会影响系统稳定性');
    }
  }
}
