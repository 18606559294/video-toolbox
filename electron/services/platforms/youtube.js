const ytdl = require('ytdl-core');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { HttpsProxyAgent } = require('https-proxy-agent');

class YouTube {
  constructor() {
    this.proxy = null;
    this.cookies = '';
    this.userDataDir = path.join(app.getPath('userData'), 'youtube');
    
    // 确保用户数据目录存在
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
  }

  setProxy(proxyUrl) {
    this.proxy = proxyUrl;
    return this;
  }

  setCookies(cookies) {
    this.cookies = cookies;
    return this;
  }

  async getVideoInfo(url) {
    try {
      const options = {
        requestOptions: {}
      };

      if (this.proxy) {
        options.requestOptions.agent = new HttpsProxyAgent(this.proxy);
      }

      if (this.cookies) {
        options.requestOptions.headers = {
          'Cookie': this.cookies
        };
      }

      const info = await ytdl.getInfo(url, options);
      return {
        title: info.videoDetails.title,
        author: info.videoDetails.author.name,
        duration: parseInt(info.videoDetails.lengthSeconds),
        formats: info.formats.map(format => ({
          itag: format.itag,
          quality: format.qualityLabel || format.quality,
          container: format.container,
          hasAudio: format.hasAudio,
          hasVideo: format.hasVideo,
          contentLength: format.contentLength,
          url: format.url
        })),
        thumbnails: info.videoDetails.thumbnails,
        description: info.videoDetails.description,
        platform: 'youtube'
      };
    } catch (error) {
      console.error('获取YouTube视频信息失败:', error);
      throw error;
    }
  }

  async download(url, options = {}) {
    try {
      const downloadOptions = {
        quality: options.quality || 'highest',
        filter: options.format === 'audio' ? 'audioonly' : 'videoandaudio',
        requestOptions: {}
      };

      if (this.proxy) {
        downloadOptions.requestOptions.agent = new HttpsProxyAgent(this.proxy);
      }

      if (this.cookies) {
        downloadOptions.requestOptions.headers = {
          'Cookie': this.cookies
        };
      }

      const stream = ytdl(url, downloadOptions);
      
      // 添加错误处理
      stream.on('error', (error) => {
        console.error('YouTube下载错误:', error);
        throw error;
      });

      return stream;
    } catch (error) {
      console.error('YouTube下载失败:', error);
      throw error;
    }
  }

  validateUrl(url) {
    return ytdl.validateURL(url);
  }

  getVideoId(url) {
    return ytdl.getVideoID(url);
  }

  async login(credentials) {
    try {
      // 使用账号密码登录
      const options = {
        requestOptions: {}
      };

      if (this.proxy) {
        options.requestOptions.agent = new HttpsProxyAgent(this.proxy);
      }

      const cookies = await ytdl.getCookies('https://www.youtube.com', options, credentials);
      this.cookies = cookies;
      return {
        cookies,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('YouTube 登录失败:', error);
      throw error;
    }
  }

  async logout() {
    try {
      // 清除cookies
      this.cookies = '';
      return true;
    } catch (error) {
      console.error('YouTube 登出失败:', error);
      throw error;
    }
  }
}

module.exports = new YouTube();
