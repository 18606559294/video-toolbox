const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');
const md5 = require('crypto-js/md5');

class IQiyiPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.iqiyi.com/',
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('iqiyi.com') || url.includes('iq.com');
  }

  async getVideoId(url) {
    // 支持多种URL格式：
    // https://www.iqiyi.com/v_xxxxx.html
    // https://www.iqiyi.com/w_xxxxx.html
    let vid = '';
    
    // 直接从URL中获取vid
    const matches = url.match(/\/(v|w)_([^.]+)/);
    if (matches) {
      vid = matches[2];
    } else {
      // 从页面内容获取vid
      const response = await axios.get(url, { headers: this.headers });
      const vidMatch = response.data.match(/param\['vid'\]\s*=\s*["']([^"']+)/);
      if (vidMatch) {
        vid = vidMatch[1];
      }
    }

    if (!vid) {
      throw new Error('无法解析视频ID');
    }

    return vid;
  }

  generateMacID() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  generateAuthKey(params) {
    const sorted = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('');
    return md5(sorted + 'secret_key').toString();
  }

  async getVideoInfo(url) {
    try {
      const vid = await this.getVideoId(url);
      const timestamp = Math.floor(Date.now() / 1000);
      const macId = this.generateMacID();
      
      // 构建请求参数
      const params = {
        vid,
        k_uid: macId,
        k_tag: 1,
        qdv: 1,
        k_ft1: 8,
        k_ft4: 32,
        k_ft5: 1,
        src: '01010031010000000000',
        ut: 0,
        rs: 1,
        dfp: '',
        platform: 'h5',
        k_err_retries: 0,
        qd_v: 2,
        tm: timestamp
      };

      // 生成认证密钥
      params.authKey = this.generateAuthKey(params);

      // 获取视频信息
      const apiUrl = 'https://cache.video.iqiyi.com/dash';
      const response = await axios.get(apiUrl, {
        params,
        headers: this.headers
      });

      const data = response.data;
      if (data.code !== 'A00000') {
        throw new Error(data.msg || '获取视频信息失败');
      }

      const videoData = data.data.program;
      return {
        title: videoData.video.title,
        duration: videoData.duration,
        coverUrl: videoData.video.coverUrl,
        description: videoData.video.description,
        publishTime: videoData.video.publishTime,
        formats: videoData.video.qualities.map(q => ({
          name: q.name,
          width: q.width,
          height: q.height,
          bitrate: q.bitrate,
          size: q.fileSize,
          format: 'mp4'
        })),
        platform: 'iqiyi',
        vid,
        streams: videoData.video.qualities.reduce((acc, q) => {
          acc[q.name] = q.urls;
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
      const streamUrls = info.streams[quality];

      if (!streamUrls || streamUrls.length === 0) {
        throw new Error('未找到可用的视频流');
      }

      // 选择最佳的CDN节点
      const videoUrl = streamUrls[0];

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
      return info.formats.some(f => f.vipRequired);
    } catch (error) {
      return false;
    }
  }
}

module.exports = new IQiyiPlatform();
