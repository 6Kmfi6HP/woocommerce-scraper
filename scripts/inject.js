import { execSync } from 'child_process';
import path from 'path';

const binary = path.join('dist', 'woocommerce-scraper');
const binaryExt = process.platform === 'win32' ? '.exe' : '';
const binaryPath = `${binary}${binaryExt}`;

try {
  console.log(`Injecting blob into ${binaryPath}...`);
  
  const command = [
    'npx postject',
    `"${binaryPath}"`,
    'NODE_SEA_BLOB',
    'dist/sea-prep.blob',
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
  ];

  // Only add macho segment for macOS
  if (process.platform === 'darwin' || process.platform === 'mac') {
    command.push('--macho-segment-name NODE_SEA');
  }

  execSync(command.join(' '));
  
  // Only run codesign on macOS
  const platform = process.argv[2];
  if (platform === 'mac') {
    execSync(`codesign --sign - "${binaryPath}"`);
  }
} catch (err) {
  console.error('Error during injection:', err);
  process.exit(1);
} 