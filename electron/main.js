const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');
const https = require('https');
const isDev = process.env.NODE_ENV !== 'production';
const Downloader = require('./services/downloader');
const I18nService = require('./services/i18n');

// 配置HTTPS全局设置
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
https.globalAgent.options.rejectUnauthorized = true;

if (require('electron-squirrel-startup')) {
  app.quit();
}

// 配置日志
log.transports.file.level = 'info';

// 主窗口
let mainWindow = null;
let downloader = null;
let i18n = null;

// 创建菜单
function createMenu(i18nService) {
  const template = [
    {
      label: i18nService.t('menu.file'),
      submenu: [
        {
          label: i18nService.t('menu.file.new'),
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-task');
          }
        },
        { type: 'separator' },
        {
          label: i18nService.t('menu.file.exit'),
          role: 'quit'
        }
      ]
    },
    {
      label: i18nService.t('menu.edit'),
      submenu: [
        { label: i18nService.t('menu.edit.undo'), role: 'undo' },
        { label: i18nService.t('menu.edit.redo'), role: 'redo' },
        { type: 'separator' },
        { label: i18nService.t('menu.edit.cut'), role: 'cut' },
        { label: i18nService.t('menu.edit.copy'), role: 'copy' },
        { label: i18nService.t('menu.edit.paste'), role: 'paste' }
      ]
    },
    {
      label: i18nService.t('menu.view'),
      submenu: [
        { label: i18nService.t('menu.view.reload'), role: 'reload' },
        { label: i18nService.t('menu.view.forcereload'), role: 'forceReload' },
        { type: 'separator' },
        { label: i18nService.t('menu.view.toggledevtools'), role: 'toggleDevTools' }
      ]
    },
    {
      label: i18nService.t('menu.window'),
      submenu: [
        { label: i18nService.t('menu.window.minimize'), role: 'minimize' },
        { label: i18nService.t('menu.window.close'), role: 'close' }
      ]
    },
    {
      label: i18nService.t('menu.help'),
      submenu: [
        {
          label: i18nService.t('menu.help.about'),
          click: () => {
            mainWindow.webContents.send('show-about');
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 创建窗口
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }
};

// 初始化应用
app.on('ready', async () => {
  try {
    // 初始化服务
    const i18nService = new I18nService();
    await i18nService.init();

    // 设置初始语言为系统语言
    const systemLanguage = app.getLocale();
    let initialLanguage = 'en'; // 默认英语

    // 根据系统语言设置应用语言
    if (systemLanguage.startsWith('zh')) {
      initialLanguage = 'zh-CN';
    } else if (systemLanguage.startsWith('ja')) {
      initialLanguage = 'ja';
    } else if (systemLanguage.startsWith('ko')) {
      initialLanguage = 'ko';
    }

    await i18nService.changeLanguage(initialLanguage);
    createMenu(i18nService); // 创建本地化菜单

    i18n = i18nService;
    downloader = new Downloader();
    await downloader.waitForInit();

    createWindow();

    // 检查更新
    if (!isDev) {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.logger = log;
      autoUpdater.checkForUpdatesAndNotify();
    }
  } catch (error) {
    console.error('Application initialization failed:', error);
    app.quit();
  }
});

// 当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 在 macOS 上，当点击 dock 图标并且没有其他窗口打开时，
// 重新创建一个窗口。
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 自动更新事件处理
if (!isDev) {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.on('checking-for-update', () => {
    log.info('正在检查更新...');
    mainWindow.webContents.send('update-message', { type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info('发现新版本:', info);
    mainWindow.webContents.send('update-message', { 
      type: 'available',
      version: info.version
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('当前是最新版本');
    mainWindow.webContents.send('update-message', { type: 'not-available' });
  });

  autoUpdater.on('error', (err) => {
    log.error('更新错误:', err);
    mainWindow.webContents.send('update-message', { 
      type: 'error',
      error: err.message
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `下载速度: ${progressObj.bytesPerSecond}`;
    logMessage = `${logMessage} - 已下载 ${progressObj.percent}%`;
    logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);
    mainWindow.webContents.send('update-message', { 
      type: 'progress',
      progress: progressObj
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('更新下载完成');
    mainWindow.webContents.send('update-message', { 
      type: 'downloaded',
      version: info.version
    });
  });
}

// IPC 通信处理
// 语言相关
ipcMain.handle('get-current-language', async () => {
  return await i18n.getCurrentLanguage();
});

ipcMain.handle('get-supported-languages', async () => {
  return await i18n.getSupportedLanguages();
});

ipcMain.handle('change-language', async (event, language) => {
  const success = await i18n.changeLanguage(language);
  if (success) {
    mainWindow.webContents.send('language-changed', language);
  }
  return success;
});

ipcMain.handle('get-translation', async (event, key, options) => {
  return await i18n.t(key, options);
});

// 下载相关
ipcMain.handle('get-supported-platforms', () => {
  return downloader.getSupportedPlatforms();
});

// 代理设置相关
ipcMain.handle('set-proxy', async (event, proxyConfig) => {
  try {
    downloader.setProxy(proxyConfig);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-proxy-config', () => {
  return downloader.proxy;
});

ipcMain.handle('get-video-info', async (event, url) => {
  try {
    return await downloader.getVideoInfo(url);
  } catch (error) {
    throw new Error(`获取视频信息失败: ${error.message}`);
  }
});

ipcMain.handle('download-video', async (event, { url, options }) => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender);
    
    return await downloader.downloadVideo(url, {
      ...options,
      onProgress: (progress) => {
        window.webContents.send('download-progress', progress);
      }
    });
  } catch (error) {
    throw new Error(`下载失败: ${error.message}`);
  }
});

// 处理视频转换
ipcMain.handle('convert-video', async (event, { input, format }) => {
  // TODO: 实现视频转换逻辑
});

// 添加新功能：检查下载目录空间
ipcMain.handle('check-disk-space', async () => {
  const downloadPath = app.getPath('downloads');
  try {
    const { free } = await checkDiskSpace(downloadPath);
    return {
      available: free,
      formatted: `${Math.round(free / 1024 / 1024 / 1024)} GB`
    };
  } catch (error) {
    log.error('Failed to check disk space:', error);
    throw error;
  }
});

// 添加新功能：清理临时文件
ipcMain.handle('cleanup-temp', async () => {
  const tempPath = app.getPath('temp');
  try {
    const files = await fs.readdir(tempPath);
    for (const file of files) {
      if (file.startsWith('video-toolbox-')) {
        await fs.unlink(path.join(tempPath, file));
      }
    }
    return true;
  } catch (error) {
    log.error('Failed to cleanup temp files:', error);
    throw error;
  }
});

// 处理渲染进程的更新请求
ipcMain.on('check-for-update', () => {
  if (!isDev) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdates();
  }
});

ipcMain.on('restart-app', () => {
  if (!isDev) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
  }
});

// disk space checking function
async function checkDiskSpace(path) {
  const stats = await fs.promises.statvfs(path);
  return {
    free: stats.f_bsize * stats.f_bfree,
    total: stats.f_bsize * stats.f_blocks,
  };
}
