const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV !== 'production';
const downloader = require('./services/downloader');

// 配置日志
log.transports.file.level = 'info';
autoUpdater.logger = log;

// 主窗口
let mainWindow;

// 创建窗口
function createWindow() {
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
}

// 应用程序准备就绪
app.whenReady().then(() => {
  createWindow();

  // 检查更新
  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 自动更新事件处理
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

// 处理渲染进程的更新请求
ipcMain.on('check-for-update', () => {
  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdates();
  }
});

ipcMain.on('restart-app', () => {
  autoUpdater.quitAndInstall();
});

// 获取支持的平台列表
ipcMain.handle('get-supported-platforms', () => {
  return downloader.getSupportedPlatforms();
});

// 获取视频信息
ipcMain.handle('get-video-info', async (event, url) => {
  try {
    return await downloader.getVideoInfo(url);
  } catch (error) {
    throw new Error(`获取视频信息失败: ${error.message}`);
  }
});

// 处理视频下载
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

// disk space checking function
async function checkDiskSpace(path) {
  const stats = await fs.promises.statvfs(path);
  return {
    free: stats.f_bsize * stats.f_bfree,
    total: stats.f_bsize * stats.f_blocks,
  };
}
