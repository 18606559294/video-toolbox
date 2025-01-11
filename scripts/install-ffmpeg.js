const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function installFFmpeg() {
  const platform = os.platform();
  const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg');
  
  if (!fs.existsSync(ffmpegPath)) {
    fs.mkdirSync(ffmpegPath, { recursive: true });
  }

  try {
    if (platform === 'win32') {
      // Windows
      console.log('正在为 Windows 安装 FFmpeg...');
      console.log('请访问以下链接手动下载 FFmpeg:');
      console.log('1. 访问 https://github.com/BtbN/FFmpeg-Builds/releases');
      console.log('2. 下载 ffmpeg-master-latest-win64-gpl.zip');
      console.log('3. 解压到以下目录:', ffmpegPath);
      console.log('4. 将解压后的 bin 目录添加到系统环境变量 PATH 中');
      process.exit(0);
    } else if (platform === 'darwin') {
      // macOS
      console.log('正在为 macOS 安装 FFmpeg...');
      execSync('brew install ffmpeg');
      console.log('FFmpeg 安装成功！');
    } else if (platform === 'linux') {
      // Linux
      console.log('正在为 Linux 安装 FFmpeg...');
      execSync('sudo apt-get update && sudo apt-get install -y ffmpeg');
      console.log('FFmpeg 安装成功！');
    }
  } catch (error) {
    console.error('安装 FFmpeg 失败:', error.message);
    console.log('\n请手动安装 FFmpeg:');
    console.log('Windows: https://www.gyan.dev/ffmpeg/builds/');
    console.log('macOS: brew install ffmpeg');
    console.log('Linux: sudo apt-get install ffmpeg');
    process.exit(1);
  }
}

installFFmpeg();
