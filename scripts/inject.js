import { execSync } from 'child_process';
import path from 'path';

const binary = path.join('dist', 'woocommerce-scraper');

try {
  console.log(`Injecting blob into ${binary}...`);
  
  const command = [
    'npx postject',
    `"${binary}"`,
    'NODE_SEA_BLOB',
    'dist/sea-prep.blob',
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    '--macho-segment-name NODE_SEA'
  ].join(' ');

  execSync(command);
  
  // Re-sign after injection
  execSync(`codesign --sign - "${binary}"`);
} catch (err) {
  console.error('Error during injection:', err);
  process.exit(1);
} 