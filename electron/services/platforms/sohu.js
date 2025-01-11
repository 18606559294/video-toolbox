const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class SohuPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://tv.sohu.com/',
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('tv.sohu.com') || url.includes('sohu.com/v');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://tv.sohu.com/v/xxxxx.html
    // https://my.tv.sohu.com/xxx/xxx.shtml
    let vid = '';
    
    const matches = url.match(/\/v\/([^.]+)\.html/) || url.match(/\/([^/]+)\.shtml$/);
    if (matches) {
      vid = matches[1];
    } else {
      // 从页面内容获取vid
      const response = await axios.get(url, { headers: this.headers });
      const vidMatch = response.data.match(/vid\s*[=:]\s*['"]([\w]+)['"]/);
      if (vidMatch) {
        vid = vidMatch[1];
      }
    }

    if (!vid) {
      throw new Error('无法解析视频ID');
    }

    return vid;
  }

  generateUID() {
    return crypto.randomBytes(8).toString('hex');
  }

  async getVideoInfo(url) {
    try {
      const vid = await this.getVideoId(url);
      const uid = this.generateUID();
      const timestamp = Math.floor(Date.now() / 1000);

      // 获取视频基本信息
      const infoUrl = `https://hot.vrs.sohu.com/vrs_flash.action`;
      const params = {
        vid,
        pid: uid,
        uid,
        plat: 'web',
        sver: '1.0',
        partner: '1',
        _: timestamp
      };

      const response = await axios.get(infoUrl, {
        params,
        headers: this.headers
      });

      const data = response.data;
      if (data.status !== 1) {
        throw new Error(data.message || '获取视频信息失败');
      }

      // 获取视频播放信息
      const playlistUrl = `https://hot.vrs.sohu.com/vrs_flash.action`;
      const playlistParams = {
        ...params,
        vid: data.data.vid,
        uid: data.data.uid
      };

      const playlistResponse = await axios.get(playlistUrl, {
        params: playlistParams,
        headers: this.headers
      });

      const playData = playlistResponse.data;
      if (playData.status !== 1) {
        throw new Error(playData.message || '获取视频播放信息失败');
      }

      const videoData = playData.data;
      return {
        title: videoData.tvName,
        duration: videoData.totalDuration,
        coverUrl: videoData.coverImg,
        description: videoData.description,
        category: videoData.categoryName,
        publishTime: videoData.createTime,
        platform: 'sohu',
        vid,
        formats: videoData.qualities.map(q => ({
          name: q.name,
          width: q.width,
          height: q.height,
          bitrate: q.bitrate,
          size: q.fileSize,
          format: 'mp4'
        })),
        streams: videoData.qualities.reduce((acc, q) => {
          acc[q.name] = q.url;
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

      const downloadUrl = response.data.url;

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
      return info.formats.some(f => f.vipRequired);
    } catch (error) {
      return false;
    }
  }
}

module.exports = new SohuPlatform();
