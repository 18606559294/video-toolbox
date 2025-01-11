const { app } = require('electron');
require('./electron/main.js');

// 确保应用程序已经准备就绪
if (!app.isReady()) {
  app.on('ready', () => {
    console.log('Application is ready');
  });
}
