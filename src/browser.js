import fs from 'fs';
import path from 'path';
import os from 'os';

const platform = os.platform();

const defaultPaths = {
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
    linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
    ],
};

export function findChromePath() {
    const paths = defaultPaths[platform] || [];
    
    // Find the first existing Chrome/Edge installation
    const browserPath = paths.find(path => fs.existsSync(path));
    
    if (!browserPath) {
        console.warn('Could not find Chrome or Edge installation. Falling back to puppeteer\'s bundled browser.');
        return null;
    }
    
    return browserPath;
}
