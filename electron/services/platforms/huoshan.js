const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class HuoshanPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.huoshan.com/',
      'Cookie': '' // 需要用户登录cookie
    };
    this.deviceId = this.generateDeviceId();
  }

  isMatch(url) {
    return url.includes('huoshan.com') || url.includes('hotsoon.com');
  }

  generateDeviceId() {
    return crypto.randomBytes(8).toString('hex');
  }

  generateSignature(params) {
    const sorted = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return crypto
      .createHmac('sha1', 'hotsoon_video_key')
      .update(sorted)
      .digest('hex');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.huoshan.com/item/{video_id}
    // https://share.huoshan.com/hotsoon/s/{short_id}
    const matches = url.match(/item\/([^/?]+)/) || url.match(/s\/([^/?]+)/);
    if (!matches) {
      throw new Error('无效的火山视频链接');
    }

    // 如果是短链接，需要解析重定向获取真实ID
    if (url.includes('/s/')) {
      const response = await axios.get(url, {
        headers: this.headers,
        maxRedirects: 0,
        validateStatus: status => status === 302
      });
      const redirectUrl = response.headers.location;
      const realMatches = redirectUrl.match(/item\/([^/?]+)/);
      if (!realMatches) {
        throw new Error('无法解析视频ID');
      }
      return realMatches[1];
    }

    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const videoId = await this.getVideoId(url);
      const timestamp = Math.floor(Date.now() / 1000);

      // 构建API请求参数
      const params = {
        video_id: videoId,
        device_id: this.deviceId,
        timestamp,
        version_code: '8.4.0',
        app_name: 'hotsoon_web',
        channel: 'pc_web'
      };

      params.signature = this.generateSignature(params);

      // 获取视频信息
      const infoUrl = 'https://api.huoshan.com/hotsoon/item/video/';
      const response = await axios.get(infoUrl, {
        params,
        headers: this.headers
      });

      const data = response.data;
      if (data.status_code !== 0) {
        throw new Error(data.message || '获取视频信息失败');
      }

      const videoInfo = data.item;
      const video = videoInfo.video;

      // 处理不同清晰度的视频
      const formats = [];
      const streams = {};

      if (video.video_list) {
        Object.entries(video.video_list).forEach(([quality, info]) => {
          let height, name;
          switch (quality) {
            case 'ultra':
              height = 1080;
              name = '1080p';
              break;
            case 'origin':
              height = 720;
              name = '720p';
              break;
            case 'high':
              height = 480;
              name = '480p';
              break;
            case 'normal':
              height = 360;
              name = '360p';
              break;
          }

          formats.push({
            name,
            height,
            format: 'mp4'
          });

          streams[name] = info.url;
        });
      }

      return {
        title: videoInfo.desc || '火山视频',
        duration: video.duration / 1000,
        coverUrl: video.cover.url_list[0],
        description: videoInfo.desc,
        author: videoInfo.author && videoInfo.author.nickname,
        publishTime: videoInfo.create_time,
        platform: 'huoshan',
        videoId,
        formats,
        streams,
        likeCount: videoInfo.stats.digg_count,
        commentCount: videoInfo.stats.comment_count,
        shareCount: videoInfo.stats.share_count,
        musicInfo: videoInfo.music_info
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
  async getComments(videoId, cursor = 0, count = 20) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        video_id: videoId,
        device_id: this.deviceId,
        cursor,
        count,
        timestamp,
        version_code: '8.4.0',
        app_name: 'hotsoon_web'
      };

      params.signature = this.generateSignature(params);

      const commentUrl = 'https://api.huoshan.com/hotsoon/item/comment/list/';
      const response = await axios.get(commentUrl, {
        params,
        headers: this.headers
      });

      return response.data.comments || [];
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取相关推荐视频
  async getRecommendations(videoId) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        video_id: videoId,
        device_id: this.deviceId,
        timestamp,
        version_code: '8.4.0',
        app_name: 'hotsoon_web'
      };

      params.signature = this.generateSignature(params);

      const recommendUrl = 'https://api.huoshan.com/hotsoon/item/relation/';
      const response = await axios.get(recommendUrl, {
        params,
        headers: this.headers
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`获取推荐视频失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(userId) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        user_id: userId,
        device_id: this.deviceId,
        timestamp,
        version_code: '8.4.0',
        app_name: 'hotsoon_web'
      };

      params.signature = this.generateSignature(params);

      const userUrl = 'https://api.huoshan.com/hotsoon/user/info/';
      const response = await axios.get(userUrl, {
        params,
        headers: this.headers
      });

      return response.data.user || null;
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 获取用户视频列表
  async getUserVideos(userId, cursor = 0, count = 20) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        user_id: userId,
        device_id: this.deviceId,
        cursor,
        count,
        timestamp,
        version_code: '8.4.0',
        app_name: 'hotsoon_web'
      };

      params.signature = this.generateSignature(params);

      const videosUrl = 'https://api.huoshan.com/hotsoon/user/video/items/';
      const response = await axios.get(videosUrl, {
        params,
        headers: this.headers
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`获取用户视频列表失败: ${error.message}`);
    }
  }
}

module.exports = new HuoshanPlatform();
