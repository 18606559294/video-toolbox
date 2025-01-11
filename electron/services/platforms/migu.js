const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class MiguPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.migu.cn/',
      'Cookie': '' // 需要用户登录cookie
    };
    this.appKey = 'miguvideo_app_key';
  }

  isMatch(url) {
    return url.includes('www.migu.cn/video') || url.includes('miguvideo.com');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.migu.cn/video/xxx
    // https://www.miguvideo.com/mgs/website/prd/detail.html?cid=xxx
    const matches = url.match(/video\/(\w+)/) || url.match(/cid=(\w+)/);
    if (!matches) {
      // 从页面内容获取cid
      const response = await axios.get(url, { headers: this.headers });
      const cidMatch = response.data.match(/cid\s*:\s*['"](\w+)['"]/);
      if (!cidMatch) {
        throw new Error('无效的咪咕视频链接');
      }
      return cidMatch[1];
    }
    return matches[1];
  }

  generateSignature(params) {
    const sorted = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return crypto.createHash('md5')
      .update(sorted + this.appKey)
      .digest('hex');
  }

  async getVideoInfo(url) {
    try {
      const contentId = await this.getVideoId(url);
      const timestamp = Math.floor(Date.now() / 1000);

      // 获取视频基本信息
      const infoUrl = 'https://www.miguvideo.com/gateway/playurl/v3/play/playurl';
      const params = {
        contentId,
        timestamp,
        channel: 'web',
        version: '3.1.0'
      };

      params.sign = this.generateSignature(params);

      const response = await axios.get(infoUrl, {
        params,
        headers: this.headers
      });

      const data = response.data;
      if (data.code !== '200') {
        throw new Error(data.message || '获取视频信息失败');
      }

      const videoInfo = data.body;
      const qualities = videoInfo.qualities || [];

      return {
        title: videoInfo.title,
        duration: videoInfo.duration,
        coverUrl: videoInfo.coverUrl,
        description: videoInfo.brief,
        category: videoInfo.typeName,
        publishTime: videoInfo.publishTime,
        platform: 'migu',
        contentId,
        formats: qualities.map(q => ({
          name: q.qualityDesc,
          width: q.width,
          height: q.height,
          bitrate: q.bitrate,
          format: q.format || 'mp4'
        })),
        streams: qualities.reduce((acc, q) => {
          acc[q.qualityDesc] = q.url;
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
        headers: {
          ...this.headers,
          'Range': 'bytes=0-'
        },
        maxRedirects: 5
      });

      const downloadUrl = response.data.url || videoUrl;

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
      return info.formats.some(f => f.isVip);
    } catch (error) {
      return false;
    }
  }

  // 获取推荐视频
  async getRecommendations(contentId) {
    try {
      const recommendUrl = 'https://www.miguvideo.com/gateway/recommend/v1/recommend';
      const params = {
        contentId,
        count: 10,
        timestamp: Math.floor(Date.now() / 1000)
      };

      params.sign = this.generateSignature(params);

      const response = await axios.get(recommendUrl, {
        params,
        headers: this.headers
      });

      return response.data.body || [];
    } catch (error) {
      throw new Error(`获取推荐视频失败: ${error.message}`);
    }
  }
}

module.exports = new MiguPlatform();
