const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class TencentPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://v.qq.com/'
    };
    this.platform = 11;  // 平台ID
  }

  isMatch(url) {
    return url.includes('v.qq.com') || url.includes('video.qq.com');
  }

  async getVid(url) {
    // 支持多种URL格式：
    // https://v.qq.com/x/cover/xxx/vid.html
    // https://v.qq.com/x/page/vid.html
    let vid = '';
    
    if (url.includes('/x/page/')) {
      const matches = url.match(/\/x\/page\/([^.]+)/);
      if (matches) {
        vid = matches[1];
      }
    } else if (url.includes('/x/cover/')) {
      const matches = url.match(/\/x\/cover\/[^/]+\/([^.]+)/);
      if (matches) {
        vid = matches[1];
      }
    }

    if (!vid) {
      // 尝试从页面内容获取vid
      const response = await axios.get(url, { headers: this.headers });
      const vidMatch = response.data.match(/vid=([^&"]+)/);
      if (vidMatch) {
        vid = vidMatch[1];
      }
    }

    if (!vid) {
      throw new Error('无法解析视频ID');
    }

    return vid;
  }

  generatePlatformArgs() {
    const appVersion = '3.5.57';
    const guid = crypto.randomBytes(16).toString('hex');
    const platform = this.platform;
    const sdtfrom = 'v1010';
    const defn = 'shd';
    const timestamp = Math.floor(Date.now() / 1000);

    return {
      guid,
      platform,
      appver: appVersion,
      sdtfrom,
      defn,
      timestamp
    };
  }

  async getVideoInfo(url) {
    try {
      const vid = await this.getVid(url);
      const args = this.generatePlatformArgs();
      
      // 获取视频基本信息
      const infoUrl = 'https://h5vv.video.qq.com/getinfo';
      const params = {
        vid,
        ...args,
        otype: 'json',
        platform: this.platform,
        charge: 0
      };

      const response = await axios.get(infoUrl, { 
        params,
        headers: this.headers
      });

      // 解析返回的数据
      const jsonStr = response.data.replace(/QZOutputJson=/, '').replace(/;$/, '');
      const data = JSON.parse(jsonStr);

      if (data.exem) {
        throw new Error(data.exem);
      }

      // 获取最佳清晰度版本
      const videoInfo = data.vl.vi[0];
      const formats = videoInfo.fl.fi.map(f => ({
        name: f.name,
        cname: f.cname,
        quality: f.qtype,
        definition: f.definition
      }));

      return {
        title: videoInfo.ti,
        duration: videoInfo.td,
        formats,
        coverUrl: videoInfo.pic,
        platform: 'tencent',
        vid,
        fileSize: videoInfo.fs,
        resolution: {
          width: videoInfo.vw,
          height: videoInfo.vh
        }
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  async getVideoUrl(vid, format) {
    const args = this.generatePlatformArgs();
    const infoUrl = 'https://h5vv.video.qq.com/getkey';
    const params = {
      vid,
      format,
      ...args,
      otype: 'json',
      platform: this.platform,
      charge: 0
    };

    const response = await axios.get(infoUrl, { 
      params,
      headers: this.headers
    });

    const jsonStr = response.data.replace(/QZOutputJson=/, '').replace(/;$/, '');
    const data = JSON.parse(jsonStr);

    if (data.exem) {
      throw new Error(data.exem);
    }

    return data.url;
  }

  async download(url, options = {}) {
    try {
      const info = await this.getVideoInfo(url);
      const format = options.quality || info.formats[0].quality;
      const videoUrl = await this.getVideoUrl(info.vid, format);

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

module.exports = new TencentPlatform();
