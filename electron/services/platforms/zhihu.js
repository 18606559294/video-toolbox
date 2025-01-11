const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class ZhihuPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.zhihu.com/',
      'x-zse-93': '101_3_3.0', // 知乎API需要的特殊header
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('zhihu.com/zvideo') || url.includes('zhihu.com/video');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.zhihu.com/zvideo/xxxxxxxxx
    // https://www.zhihu.com/video/xxxxxxxxx
    const matches = url.match(/\/(?:zvideo|video)\/([^?/]+)/);
    if (!matches) {
      throw new Error('无效的知乎视频链接');
    }
    return matches[1];
  }

  generateXZse96(path) {
    // 知乎API需要的签名
    const md5 = crypto.createHash('md5');
    const str = '101_3_3.0' + '+' + path + '+' + 'ZhihuClient';
    return md5.update(str).digest('hex');
  }

  async getVideoInfo(url) {
    try {
      const videoId = await this.getVideoId(url);
      const apiPath = `/api/v4/zvideo/${videoId}`;
      
      // 获取视频信息
      const infoUrl = 'https://www.zhihu.com' + apiPath;
      const headers = {
        ...this.headers,
        'x-zse-96': this.generateXZse96(apiPath)
      };

      const response = await axios.get(infoUrl, { headers });
      const data = response.data;

      // 解析视频清晰度
      const playList = data.playlist;
      const formats = [];
      const streams = {};

      Object.entries(playList).forEach(([quality, info]) => {
        let height, name;
        switch (quality) {
          case 'FHD':
            height = 1080;
            name = '1080p';
            break;
          case 'HD':
            height = 720;
            name = '720p';
            break;
          case 'SD':
            height = 480;
            name = '480p';
            break;
          case 'LD':
            height = 360;
            name = '360p';
            break;
        }

        if (height) {
          formats.push({
            name,
            height,
            format: 'mp4'
          });

          streams[name] = info.play_url;
        }
      });

      return {
        title: data.title,
        duration: data.duration,
        coverUrl: data.cover_url,
        description: data.description,
        author: data.author && data.author.name,
        publishTime: data.created_time,
        platform: 'zhihu',
        videoId,
        formats,
        streams,
        upvoteCount: data.vote_count,
        commentCount: data.comment_count,
        topics: data.topics && data.topics.map(t => t.name)
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

  // 获取视频评论
  async getComments(videoId, offset = 0, limit = 20) {
    try {
      const apiPath = `/api/v4/zvideo/${videoId}/comments`;
      const commentUrl = 'https://www.zhihu.com' + apiPath;
      
      const headers = {
        ...this.headers,
        'x-zse-96': this.generateXZse96(apiPath)
      };

      const params = {
        offset,
        limit,
        order: 'reverse'
      };

      const response = await axios.get(commentUrl, {
        params,
        headers
      });

      return response.data.data || [];
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取相关推荐视频
  async getRecommendations(videoId) {
    try {
      const apiPath = `/api/v4/zvideo/${videoId}/recommendations`;
      const recommendUrl = 'https://www.zhihu.com' + apiPath;
      
      const headers = {
        ...this.headers,
        'x-zse-96': this.generateXZse96(apiPath)
      };

      const response = await axios.get(recommendUrl, { headers });
      return response.data.data || [];
    } catch (error) {
      throw new Error(`获取推荐视频失败: ${error.message}`);
    }
  }

  // 获取作者其他视频
  async getAuthorVideos(authorId, offset = 0, limit = 20) {
    try {
      const apiPath = `/api/v4/members/${authorId}/zvideos`;
      const videosUrl = 'https://www.zhihu.com' + apiPath;
      
      const headers = {
        ...this.headers,
        'x-zse-96': this.generateXZse96(apiPath)
      };

      const params = {
        offset,
        limit
      };

      const response = await axios.get(videosUrl, {
        params,
        headers
      });

      return response.data.data || [];
    } catch (error) {
      throw new Error(`获取作者视频失败: ${error.message}`);
    }
  }
}

module.exports = new ZhihuPlatform();
