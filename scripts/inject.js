import { execSync } from 'child_process';
import path from 'path';

// Platform-specific binary names
const getBinaryName = () => {
  switch (process.platform) {
    case 'win32':
      return 'woocommerce-scraper.exe';
    case 'darwin':
      return 'woocommerce-scraper-darwin-x64';
    case 'mac':
      return 'woocommerce-scraper-darwin-x64';
    case 'linux':
      return 'woocommerce-scraper-linux-x64';
    default:
      throw new Error('Unsupported platform');
  }
};

const binaryName = getBinaryName();
const binaryPath = path.join('dist', binaryName);

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

  if (process.platform === 'darwin' || process.platform === 'mac') {
    command.push('--macho-segment-name NODE_SEA');
  }

  execSync(command.join(' '));
  
  if (process.platform === 'darwin' || process.platform === 'mac') {
    execSync(`codesign --sign - "${binaryPath}"`);
  }
} catch (err) {
  console.error('Error during injection:', err);
  process.exit(1);
} 