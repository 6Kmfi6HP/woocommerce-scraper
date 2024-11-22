import { parseArgs } from './cli.js';
import { scrapeWooCommerce } from './scraper.js';

// 处理进程信号
function handleSignals() {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  signals.forEach(signal => {
    process.on(signal, () => {
      console.log('\n正在优雅关闭...');
      // 给异步操作一些时间来清理
      setTimeout(() => {
        console.log('已终止爬虫程序');
        process.exit(0);
      }, 1000);
    });
  });

  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason);
  });
}

async function main() {
  // 初始化信号处理
  handleSignals();

  try {
    const args = process.argv.slice(2);
    const { websiteUrl, maxProducts, concurrency } = await parseArgs(args);

    // 开始爬取
    const startTime = Date.now();
    await scrapeWooCommerce(websiteUrl, maxProducts, concurrency);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n爬取完成！总用时: ${duration} 秒`);
  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

// 启动程序
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});