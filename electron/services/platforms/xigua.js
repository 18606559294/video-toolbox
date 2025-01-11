const BasePlatform = require('./base');
const axios = require('axios');
const { parse } = require('url');

class XiguaPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.ixigua.com/'
    };
  }

  isMatch(url) {
    return url.includes('ixigua.com') || url.includes('xigua.com');
  }

  async getVideoId(url) {
    // 支持两种URL格式：
    // https://www.ixigua.com/[videoId]
    // https://www.ixigua.com/detail/[videoId]
    const matches = url.match(/ixigua\.com\/(detail\/)?(\d+)/);
    if (!matches) {
      throw new Error('无效的西瓜视频链接');
    }
    return matches[2];
  }

  async getVideoInfo(url) {
    try {
      const videoId = await this.getVideoId(url);
      const apiUrl = `https://www.ixigua.com/api/public/videov2/detail/${videoId}`;
      
      const response = await axios.get(apiUrl, { 
        headers: this.headers,
        params: {
          _signature: Date.now()
        }
      });

      if (!response.data.data) {
        throw new Error('未找到视频信息');
      }

      const videoData = response.data.data;
      return {
        title: videoData.title,
        author: videoData.user_info.name,
        duration: videoData.video_duration,
        coverUrl: videoData.poster_url,
        description: videoData.abstract,
        videoUrl: videoData.video_list.video_1.main_url,
        platform: 'xigua',
        quality: {
          width: videoData.video_list.video_1.definition,
          height: videoData.video_list.video_1.vheight
        }
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  async download(url, options = {}) {
    try {
      const info = await this.getVideoInfo(url);
      const videoUrl = info.videoUrl;

      // 获取真实下载地址
      const response = await axios({
        method: 'GET',
        url: videoUrl,
        headers: {
          ...this.headers,
          'Range': 'bytes=0-'
        },
        maxRedirects: 5,
        responseType: 'stream'
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

module.exports = new XiguaPlatform();
