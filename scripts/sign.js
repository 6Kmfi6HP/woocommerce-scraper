import { execSync } from 'child_process';
import path from 'path';

const binary = path.join('dist', 'woocommerce-scraper');

try {
  execSync(`codesign --remove-signature "${binary}"`);
} catch (err) {
  console.error('Error during signing:', err);
  process.exit(1);
} 