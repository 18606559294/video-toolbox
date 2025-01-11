const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class PPTVPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://v.pptv.com/',
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('v.pptv.com') || url.includes('pptv.com/show/');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://v.pptv.com/show/xxx.html
    // https://v.pptv.com/page/xxx.html
    let vid = '';
    
    const matches = url.match(/show\/([^.]+)\.html/) || url.match(/page\/([^.]+)\.html/);
    if (matches) {
      vid = matches[1];
    } else {
      // 从页面内容获取vid
      const response = await axios.get(url, { headers: this.headers });
      const vidMatch = response.data.match(/webcfg\s*=\s*{\s*"id"\s*:\s*"?(\d+)"?/);
      if (vidMatch) {
        vid = vidMatch[1];
      }
    }

    if (!vid) {
      throw new Error('无法解析视频ID');
    }

    return vid;
  }

  generatePPTVKey(params) {
    const sorted = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return crypto.createHash('md5')
      .update(sorted + 'pptv-key')
      .digest('hex');
  }

  async getVideoInfo(url) {
    try {
      const vid = await this.getVideoId(url);
      const timestamp = Math.floor(Date.now() / 1000);

      // 获取视频基本信息
      const infoUrl = 'https://web-play.pptv.com/webplay3-0-';
      const params = {
        zone: 8,
        pid: 1,
        sid: vid,
        param: {
          type: 'web',
          userType: 0,
          version: 4
        },
        platform: 'web',
        ch: 'web',
        type: 'ppbox',
        o: 0,
        appid: 'pptv.web.h5',
        appplt: 'web',
        appver: '4.0.6',
        cb: `cb_${timestamp}`
      };

      params.key = this.generatePPTVKey(params);

      const response = await axios.get(`${infoUrl}${vid}.xml`, {
        params,
        headers: this.headers
      });

      // 解析返回的数据
      const data = response.data;
      if (!data.childNodes || !data.childNodes.length) {
        throw new Error('获取视频信息失败');
      }

      const videoInfo = data.childNodes[0];
      const channels = videoInfo.channels || [];
      
      return {
        title: videoInfo.title,
        duration: parseInt(videoInfo.duration),
        coverUrl: videoInfo.picUrl,
        description: videoInfo.desc,
        category: videoInfo.channel,
        platform: 'pptv',
        vid,
        formats: channels.map(ch => ({
          name: ch.name,
          width: ch.width,
          height: ch.height,
          bitrate: ch.bitrate,
          format: 'mp4'
        })),
        streams: channels.reduce((acc, ch) => {
          acc[ch.name] = ch.urls[0];
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
      return info.formats.some(f => f.needVip);
    } catch (error) {
      return false;
    }
  }
}

module.exports = new PPTVPlatform();
