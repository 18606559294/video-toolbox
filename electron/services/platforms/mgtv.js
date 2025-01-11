const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class MGTVPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.mgtv.com/',
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('mgtv.com');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.mgtv.com/b/xxx/yyyy.html
    const matches = url.match(/\/b\/\d+\/(\d+)\.html/);
    if (!matches) {
      // 尝试从页面内容获取
      const response = await axios.get(url, { headers: this.headers });
      const vidMatch = response.data.match(/vid\s*:\s*['"](\d+)['"]/);
      if (!vidMatch) {
        throw new Error('无效的芒果TV视频链接');
      }
      return vidMatch[1];
    }
    return matches[1];
  }

  generateRandomString(length) {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  generateTK2(params) {
    const sorted = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return crypto.createHash('sha256')
      .update(sorted + 'mgtv-api-key')
      .digest('hex');
  }

  async getVideoInfo(url) {
    try {
      const vid = await this.getVideoId(url);
      const timestamp = Math.floor(Date.now() / 1000);
      const random = this.generateRandomString(16);
      
      // 获取视频基本信息
      const infoParams = {
        vid,
        timestamp,
        random,
        _support: 10000000,
        auth_mode: 1,
      };
      
      infoParams.tk2 = this.generateTK2(infoParams);
      
      const infoUrl = 'https://pcweb.api.mgtv.com/video/info';
      const infoResponse = await axios.get(infoUrl, {
        params: infoParams,
        headers: this.headers
      });

      if (infoResponse.data.code !== 200) {
        throw new Error(infoResponse.data.msg);
      }

      const videoInfo = infoResponse.data.data;

      // 获取播放地址
      const playParams = {
        vid,
        timestamp,
        random,
        _support: 10000000,
        auth_mode: 1,
        accid: this.generateRandomString(32)
      };
      
      playParams.tk2 = this.generateTK2(playParams);
      
      const playUrl = 'https://pcweb.api.mgtv.com/player/video';
      const playResponse = await axios.get(playUrl, {
        params: playParams,
        headers: this.headers
      });

      if (playResponse.data.code !== 200) {
        throw new Error(playResponse.data.msg);
      }

      const playData = playResponse.data.data;
      
      return {
        title: videoInfo.title,
        duration: videoInfo.duration,
        coverUrl: videoInfo.cover,
        description: videoInfo.desc,
        author: videoInfo.creator && videoInfo.creator.name,
        publishTime: videoInfo.publish_time,
        platform: 'mgtv',
        vid,
        formats: playData.stream.map(s => ({
          name: s.name,
          width: s.width,
          height: s.height,
          bitrate: s.bitrate,
          fileSize: s.filesize,
          format: 'mp4'
        })),
        streams: playData.stream.reduce((acc, s) => {
          acc[s.name] = s.url;
          return acc;
        }, {})
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  async download(url, options = {}) {
    try {
      const info = await this.getVideoInfo(url);
      const quality = options.quality || Object.keys(info.streams)[0];
      const videoUrl = info.streams[quality];

      if (!videoUrl) {
        throw new Error('未找到可用的视频流');
      }

      // 获取实际的下载地址
      const response = await axios.get(videoUrl, {
        headers: this.headers,
        maxRedirects: 5
      });

      const downloadUrl = response.data.info;

      const downloadResponse = await axios({
        method: 'GET',
        url: downloadUrl,
        headers: {
          ...this.headers,
          'Range': 'bytes=0-'
        },
        responseType: 'stream',
        onDownloadProgress: options.onProgress
      });

      return {
        stream: downloadResponse.data,
        info: {
          ...info,
          size: parseInt(downloadResponse.headers['content-length'] || 0),
          quality
        }
      };
    } catch (error) {
      throw new Error(`下载失败: ${error.message}`);
    }
  }

  // 检查是否需要会员权限
  async checkVipRequired(url) {
    try {
      const info = await this.getVideoInfo(url);
      return info.formats.some(f => f.needVip);
    } catch (error) {
      return false;
    }
  }
}

module.exports = new MGTVPlatform();
