const BasePlatform = require('./base');
const axios = require('axios');

class BiliBiliPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.bilibili.com'
    };
  }

  isMatch(url) {
    return url.includes('bilibili.com');
  }

  async getBvid(url) {
    const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
    if (!bvidMatch) {
      throw new Error('无效的哔哩哔哩视频链接');
    }
    return bvidMatch[0];
  }

  async getVideoInfo(url) {
    try {
      const bvid = await this.getBvid(url);
      const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
      
      const response = await axios.get(apiUrl, { headers: this.headers });
      const { data } = response.data;

      if (!data) {
        throw new Error('未找到视频信息');
      }

      // 获取视频流信息
      const cidUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${data.cid}&qn=80&fnval=0&fnver=0&fourk=1`;
      const streamResponse = await axios.get(cidUrl, { headers: this.headers });
      const streamData = streamResponse.data.data;

      return {
        title: data.title,
        author: data.owner.name,
        duration: data.duration,
        coverUrl: data.pic,
        description: data.desc,
        videoUrl: streamData.durl[0].url,
        quality: streamData.quality,
        platform: 'bilibili'
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  async download(url, options = {}) {
    try {
      const info = await this.getVideoInfo(url);
      const videoUrl = info.videoUrl;
      
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

module.exports = new BiliBiliPlatform();
