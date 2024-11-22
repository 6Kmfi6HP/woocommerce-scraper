import fs from 'fs';
import os from 'os';

// 获取当前操作系统平台
const platform = os.platform();

// 各平台默认浏览器路径
const defaultPaths = {
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',  // 添加 Chromium 支持
    ],
    win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Users\\%USERNAME%\\AppData\\Local\\Chromium\\Application\\chrome.exe',  // 添加 Chromium 支持
    ],
    linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
        '/snap/bin/chromium',  // 添加 Snap 包支持
        '/var/lib/snapd/snap/bin/chromium',  // 添加 Snap 包支持
    ],
};

/**
 * 查找系统中已安装的 Chrome/Edge/Chromium 浏览器
 * @returns {string|null} 浏览器可执行文件路径，如果未找到则返回 null
 */
export function findChromePath() {
    const paths = defaultPaths[platform] || [];
    
    // 在 Windows 上替换 %USERNAME% 环境变量
    if (platform === 'win32') {
        const username = process.env.USERNAME || '';
        paths.forEach((path, index) => {
            paths[index] = path.replace('%USERNAME%', username);
        });
    }
    
    // 查找第一个存在的浏览器安装
    const browserPath = paths.find(path => fs.existsSync(path));
    
    if (!browserPath) {
        console.warn('未找到 Chrome/Edge/Chromium 浏览器，将使用 Puppeteer 自带的浏览器。');
        return null;
    }
    
    return browserPath;
}
