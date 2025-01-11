const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class AcFunPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.acfun.cn/',
      'Cookie': '' // 需要用户登录cookie
    };
    this.deviceId = this.generateDeviceId();
  }

  isMatch(url) {
    return url.includes('acfun.cn/v/') || url.includes('acfun.cn/bangumi/');
  }

  generateDeviceId() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.acfun.cn/v/ac12345678
    // https://www.acfun.cn/bangumi/aa12345678
    const matches = url.match(/\/(v|bangumi)\/(ac|aa)(\d+)/);
    if (!matches) {
      throw new Error('无效的AcFun视频链接');
    }
    return {
      type: matches[1],
      prefix: matches[2],
      id: matches[3]
    };
  }

  generateVisitorId() {
    return crypto.randomBytes(16).toString('hex');
  }

  async getVideoInfo(url) {
    try {
      const videoIdInfo = await this.getVideoId(url);
      const visitorId = this.generateVisitorId();
      const timestamp = Math.floor(Date.now() / 1000);

      // 获取视频基本信息
      const infoUrl = 'https://www.acfun.cn/rest/pc-direct/play/playInfo/auto';
      const params = {
        videoId: videoIdInfo.id,
        resourceType: videoIdInfo.type === 'v' ? 'video' : 'bangumi',
        resourceId: videoIdInfo.id,
        videoFormat: 'HDFlv2',
        platform: 'PC',
        visitorId,
        timestamp
      };

      const response = await axios.post(infoUrl, params, {
        headers: {
          ...this.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const data = response.data;
      if (data.result !== 0) {
        throw new Error(data.error_msg || '获取视频信息失败');
      }

      const videoInfo = data.playInfo;
      const streams = videoInfo.streams || [];
      const representations = videoInfo.representations || [];

      return {
        title: videoInfo.title,
        duration: videoInfo.duration,
        coverUrl: videoInfo.coverUrl,
        description: videoInfo.description,
        author: videoInfo.user && videoInfo.user.name,
        publishTime: videoInfo.createTime,
        platform: 'acfun',
        videoId: videoIdInfo.id,
        formats: representations.map(r => ({
          name: r.qualityLabel,
          width: r.width,
          height: r.height,
          bitrate: r.bitrate,
          format: 'mp4'
        })),
        streams: representations.reduce((acc, r) => {
          acc[r.qualityLabel] = r.url;
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

      const response = await axios({
        method: 'GET',
        url: videoUrl,
        headers: {
          ...this.headers,
          'Range': 'bytes=0-'
        },
        responseType: 'stream',
        onDownloadProgress: options.onProgress
      });

      return {
        stream: response.data,
        info: {
          ...info,
          size: parseInt(response.headers['content-length'] || 0),
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

  // 获取弹幕
  async getDanmaku(videoId) {
    try {
      const danmakuUrl = `https://www.acfun.cn/rest/pc-direct/new-danmaku/poll`;
      const params = {
        videoId,
        lastFetchTime: 0
      };

      const response = await axios.get(danmakuUrl, {
        params,
        headers: this.headers
      });

      return response.data.danmakus || [];
    } catch (error) {
      throw new Error(`获取弹幕失败: ${error.message}`);
    }
  }
}

module.exports = new AcFunPlatform();
