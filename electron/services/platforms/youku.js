const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class YoukuPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://v.youku.com/',
      'Cookie': '' // 某些视频可能需要登录
    };
    this.clientId = 'd26e7f0a77ae12ce'; // 优酷客户端ID
  }

  isMatch(url) {
    return url.includes('youku.com') || url.includes('soku.com');
  }

  async getVideoId(url) {
    // 支持多种URL格式：
    // https://v.youku.com/v_show/id_XXX.html
    // https://v.youku.com/v_nextstage/id_XXX.html
    const matches = url.match(/id_([\w=]+)/);
    if (!matches) {
      throw new Error('无效的优酷视频链接');
    }
    return matches[1];
  }

  generateUtdid() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateCna() {
    return crypto.randomBytes(16).toString('base64');
  }

  async getVideoInfo(url) {
    try {
      const videoId = await this.getVideoId(url);
      const utdid = this.generateUtdid();
      const cna = this.generateCna();

      // 获取视频基本信息
      const apiUrl = 'https://ups.youku.com/ups/get.json';
      const params = {
        vid: videoId,
        ccode: '0590',
        client_ip: '192.168.1.1',
        utid: utdid,
        client_ts: Math.floor(Date.now() / 1000),
        ckey: 'DIl58SLFxFNndSV1GFNnMQVYkx1PP5tKe1siZu/86PR1u/Wh1Ptd+WOZsHHWxysSfAOhNJpdVWsdVJNsfJ8Sxd8WKVvNfAS8aS8fAOzYARzPyPc3JvtnPHjTdKfESTdnuTW6ZPvk2pNDh4uFzotgdMEFkzQ5wZVXl2Pf1/Y6hLK0OnCNxBj3+nb0v72gZ6b0td+WOZsHHWxysSo/0y9D2K42SaB8Y/+aD2K42SaB8Y/+ahU+WOZsHcrxysooUeND',
        site: 1,
        wintype: 'BrowserWindow',
        r: Math.random()
      };

      const response = await axios.get(apiUrl, { 
        params,
        headers: {
          ...this.headers,
          'X-CLIENT-ID': this.clientId
        }
      });

      const data = response.data;
      if (data.e) {
        throw new Error(data.e.desc);
      }

      const videoData = data.data;
      const stream = videoData.stream[0];

      return {
        title: videoData.video.title,
        duration: videoData.video.seconds,
        author: videoData.video.username,
        coverUrl: videoData.video.logo,
        description: videoData.video.desc,
        category: videoData.video.category_name,
        formats: videoData.stream.map(s => ({
          width: s.width,
          height: s.height,
          quality: s.stream_type,
          size: s.size,
          format: s.drm_type || 'mp4'
        })),
        platform: 'youku',
        videoId,
        streamInfo: {
          type: stream.stream_type,
          segs: stream.segs
        }
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  async getStreamUrl(videoId, streamInfo) {
    const utdid = this.generateUtdid();
    const apiUrl = 'https://ups.youku.com/ups/get.json';
    const params = {
      vid: videoId,
      ccode: '0590',
      client_ip: '192.168.1.1',
      utid: utdid,
      client_ts: Math.floor(Date.now() / 1000),
      ckey: 'DIl58SLFxFNndSV1GFNnMQVYkx1PP5tKe1siZu/86PR1u/Wh1Ptd+WOZsHHWxysSfAOhNJpdVWsdVJNsfJ8Sxd8WKVvNfAS8aS8fAOzYARzPyPc3JvtnPHjTdKfESTdnuTW6ZPvk2pNDh4uFzotgdMEFkzQ5wZVXl2Pf1/Y6hLK0OnCNxBj3+nb0v72gZ6b0td+WOZsHHWxysSo/0y9D2K42SaB8Y/+aD2K42SaB8Y/+ahU+WOZsHcrxysooUeND',
      site: 1
    };

    const response = await axios.get(apiUrl, { 
      params,
      headers: {
        ...this.headers,
        'X-CLIENT-ID': this.clientId
      }
    });

    const data = response.data;
    if (data.e) {
      throw new Error(data.e.desc);
    }

    // 获取最佳质量的视频片段
    const stream = data.data.stream.find(s => s.stream_type === streamInfo.type);
    if (!stream) {
      throw new Error('未找到指定质量的视频流');
    }

    return stream.segs[0].cdn_url;
  }

  async download(url, options = {}) {
    try {
      const info = await this.getVideoInfo(url);
      const videoUrl = await this.getStreamUrl(info.videoId, info.streamInfo);

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
          size: parseInt(response.headers['content-length'] || 0)
        }
      };
    } catch (error) {
      throw new Error(`下载失败: ${error.message}`);
    }
  }
}

module.exports = new YoukuPlatform();
