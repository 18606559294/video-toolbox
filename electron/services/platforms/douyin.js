const BasePlatform = require('./base');
const axios = require('axios');
const { parse } = require('url');

class DouyinPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
  }

  isMatch(url) {
    return url.includes('douyin.com') || url.includes('iesdouyin.com');
  }

  async getRedirectUrl(url) {
    try {
      const response = await axios.get(url, {
        headers: this.headers,
        maxRedirects: 5
      });
      return response.request.res.responseUrl;
    } catch (error) {
      throw new Error(`获取重定向URL失败: ${error.message}`);
    }
  }

  async getVideoId(url) {
    const redirectUrl = await this.getRedirectUrl(url);
    const parsedUrl = parse(redirectUrl, true);
    const pathParts = parsedUrl.pathname.split('/');
    return pathParts[pathParts.length - 1];
  }

  async getVideoInfo(url) {
    try {
      const videoId = await this.getVideoId(url);
      const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`;
      
      const response = await axios.get(apiUrl, { headers: this.headers });
      const data = response.data;

      if (!data.item_list || data.item_list.length === 0) {
        throw new Error('未找到视频信息');
      }

      const videoInfo = data.item_list[0];
      return {
        title: videoInfo.desc || '抖音视频',
        author: videoInfo.author.nickname,
        duration: videoInfo.duration,
        coverUrl: videoInfo.video.cover.url_list[0],
        videoUrl: videoInfo.video.play_addr.url_list[0],
        platform: 'douyin'
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
        headers: this.headers,
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

module.exports = new DouyinPlatform();
