const fs = require('fs-extra');
const path = require('path');

// 源目录和目标目录
const electronDir = path.join(__dirname, '..', 'electron');
const buildDir = path.join(__dirname, '..', 'build');

// 确保目标目录存在
fs.ensureDirSync(buildDir);

// 复制 electron 目录到 build 目录
fs.copySync(electronDir, path.join(buildDir, 'electron'), {
  filter: (src, dest) => {
    // 可以在这里添加过滤规则，例如不复制某些文件
    return true;
  }
});
