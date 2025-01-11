const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class WeiboPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://weibo.com/',
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('weibo.com/tv/show') || url.includes('video.weibo.com/show');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://weibo.com/tv/show/xxxxxx
    // https://video.weibo.com/show/xxxxxx
    const matches = url.match(/show\/([^?&/]+)/);
    if (!matches) {
      throw new Error('无效的微博视频链接');
    }
    return matches[1];
  }

  generateWeiboToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  async getVideoInfo(url) {
    try {
      const fid = await this.getVideoId(url);
      const token = this.generateWeiboToken();

      // 获取视频信息
      const infoUrl = 'https://weibo.com/tv/api/component';
      const params = {
        data: JSON.stringify({
          Component_Play_Playinfo: {
            oid: fid
          }
        })
      };

      const response = await axios.get(infoUrl, {
        params,
        headers: {
          ...this.headers,
          'x-xsrf-token': token
        }
      });

      const data = response.data;
      if (data.code !== 0) {
        throw new Error(data.msg || '获取视频信息失败');
      }

      const videoInfo = data.data.Component_Play_Playinfo;
      const urls = videoInfo.urls || {};

      // 解析不同清晰度的视频地址
      const streams = {};
      const formats = [];
      Object.keys(urls).forEach(quality => {
        const url = urls[quality];
        const [width, height] = quality.split('x').map(Number);
        
        let qualityName;
        if (height >= 1080) qualityName = '1080p';
        else if (height >= 720) qualityName = '720p';
        else if (height >= 480) qualityName = '480p';
        else qualityName = '360p';

        formats.push({
          name: qualityName,
          width,
          height,
          format: 'mp4'
        });

        streams[qualityName] = url;
      });

      return {
        title: videoInfo.title || '微博视频',
        duration: videoInfo.duration,
        coverUrl: videoInfo.cover_image,
        description: videoInfo.description,
        author: videoInfo.user && videoInfo.user.screen_name,
        publishTime: videoInfo.created_at,
        platform: 'weibo',
        fid,
        formats,
        streams
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
  async getComments(fid, page = 1, count = 20) {
    try {
      const commentUrl = 'https://weibo.com/tv/api/component';
      const params = {
        data: JSON.stringify({
          Component_Play_Playinfo: {
            oid: fid,
            page,
            count
          }
        })
      };

      const response = await axios.get(commentUrl, {
        params,
        headers: this.headers
      });

      return response.data.data.comments || [];
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取相关推荐视频
  async getRecommendations(fid) {
    try {
      const recommendUrl = 'https://weibo.com/tv/api/component';
      const params = {
        data: JSON.stringify({
          Component_Play_Playinfo: {
            oid: fid,
            scene: 'recommend'
          }
        })
      };

      const response = await axios.get(recommendUrl, {
        params,
        headers: this.headers
      });

      return response.data.data.relates || [];
    } catch (error) {
      throw new Error(`获取推荐视频失败: ${error.message}`);
    }
  }

  // 获取用户其他视频
  async getUserVideos(uid, page = 1, count = 20) {
    try {
      const userVideosUrl = 'https://weibo.com/tv/api/component';
      const params = {
        data: JSON.stringify({
          Component_Play_Playinfo: {
            uid,
            page,
            count
          }
        })
      };

      const response = await axios.get(userVideosUrl, {
        params,
        headers: this.headers
      });

      return response.data.data.videos || [];
    } catch (error) {
      throw new Error(`获取用户视频失败: ${error.message}`);
    }
  }
}

module.exports = new WeiboPlatform();
