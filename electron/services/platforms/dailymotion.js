const BasePlatform = require('./base');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

class DailymotionPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    };
    this.proxy = null;
  }

  setProxy(proxyUrl) {
    this.proxy = proxyUrl;
    return this;
  }

  getAxiosConfig() {
    const config = {
      headers: this.headers
    };
    if (this.proxy) {
      config.httpsAgent = new HttpsProxyAgent(this.proxy);
    }
    return config;
  }

  isMatch(url) {
    return url.includes('dailymotion.com/video/') || url.includes('dai.ly/');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.dailymotion.com/video/x7tgd2g
    // https://dai.ly/x7tgd2g
    const matches = url.match(/(?:\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
    if (!matches) {
      throw new Error('无效的Dailymotion视频链接');
    }
    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const videoId = await this.getVideoId(url);

      // 获取视频信息
      const apiUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
      const response = await axios.get(apiUrl, this.getAxiosConfig());

      const videoData = response.data;
      if (!videoData) {
        throw new Error('无法获取视频信息');
      }

      // 处理不同清晰度的视频
      const formats = [];
      const streams = {};

      // 处理自适应流
      if (videoData.qualities) {
        Object.entries(videoData.qualities).forEach(([quality, urls]) => {
          let qualityName;
          switch (quality) {
            case '1080':
              qualityName = '1080p';
              break;
            case '720':
              qualityName = '720p';
              break;
            case '480':
              qualityName = '480p';
              break;
            case '380':
            case '240':
              qualityName = '360p';
              break;
            default:
              qualityName = quality + 'p';
          }

          formats.push({
            name: qualityName,
            format: 'mp4'
          });
          streams[qualityName] = urls[0].url;
        });
      }

      return {
        title: videoData.title,
        duration: videoData.duration,
        coverUrl: videoData.posters[Object.keys(videoData.posters).pop()],
        description: videoData.description,
        author: videoData.owner.screenname,
        authorId: videoData.owner.id,
        publishTime: videoData.created_time,
        platform: 'dailymotion',
        videoId,
        formats,
        streams,
        statistics: {
          viewCount: videoData.views_total,
          likeCount: videoData.likes_total,
          commentCount: videoData.comments_total
        },
        isPrivate: videoData.private,
        isLive: videoData.onair,
        country: videoData.country,
        language: videoData.language,
        tags: videoData.tags,
        channel: videoData.channel,
        allowEmbed: videoData.allow_embed,
        explicit: videoData.explicit
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
        ...this.getAxiosConfig(),
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

  // 获取评论
  async getComments(videoId, cursor = '', count = 20) {
    try {
      const commentsUrl = `https://api.dailymotion.com/video/${videoId}/comments`;
      const params = {
        limit: count,
        page: cursor || 1,
        fields: 'id,message,created_time,owner.screenname,owner.avatar_120_url,likes_total,replies_total'
      };

      const response = await axios.get(commentsUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        comments: response.data.list || [],
        total: response.data.total,
        cursor: response.data.page,
        hasMore: response.data.has_more
      };
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(username) {
    try {
      const userUrl = `https://api.dailymotion.com/user/${username}`;
      const params = {
        fields: 'id,screenname,description,avatar_720_url,cover_url,followers_total,following_total,videos_total,views_total,country,created_time,status'
      };

      const response = await axios.get(userUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const user = response.data;
      return {
        id: user.id,
        username: user.screenname,
        description: user.description,
        avatarUrl: user.avatar_720_url,
        coverUrl: user.cover_url,
        stats: {
          followers: user.followers_total,
          following: user.following_total,
          videos: user.videos_total,
          views: user.views_total
        },
        country: user.country,
        createdTime: user.created_time,
        status: user.status
      };
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 获取用户视频
  async getUserVideos(username, cursor = '', count = 20) {
    try {
      const videosUrl = `https://api.dailymotion.com/user/${username}/videos`;
      const params = {
        limit: count,
        page: cursor || 1,
        fields: 'id,title,thumbnail_720_url,duration,views_total,likes_total,comments_total,created_time,description'
      };

      const response = await axios.get(videosUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        videos: response.data.list || [],
        total: response.data.total,
        cursor: response.data.page,
        hasMore: response.data.has_more
      };
    } catch (error) {
      throw new Error(`获取用户视频失败: ${error.message}`);
    }
  }

  // 获取相关视频
  async getRelatedVideos(videoId, cursor = '', count = 20) {
    try {
      const relatedUrl = `https://api.dailymotion.com/video/${videoId}/related`;
      const params = {
        limit: count,
        page: cursor || 1,
        fields: 'id,title,thumbnail_720_url,duration,views_total,likes_total,comments_total,created_time,owner.screenname'
      };

      const response = await axios.get(relatedUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        videos: response.data.list || [],
        total: response.data.total,
        cursor: response.data.page,
        hasMore: response.data.has_more
      };
    } catch (error) {
      throw new Error(`获取相关视频失败: ${error.message}`);
    }
  }

  // 获取播放列表信息
  async getPlaylistInfo(playlistId) {
    try {
      const playlistUrl = `https://api.dailymotion.com/playlist/${playlistId}`;
      const params = {
        fields: 'id,name,description,owner.screenname,videos_total,created_time,updated_time'
      };

      const response = await axios.get(playlistUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return response.data;
    } catch (error) {
      throw new Error(`获取播放列表信息失败: ${error.message}`);
    }
  }

  // 获取播放列表视频
  async getPlaylistVideos(playlistId, cursor = '', count = 20) {
    try {
      const videosUrl = `https://api.dailymotion.com/playlist/${playlistId}/videos`;
      const params = {
        limit: count,
        page: cursor || 1,
        fields: 'id,title,thumbnail_720_url,duration,views_total,likes_total,comments_total,created_time,owner.screenname'
      };

      const response = await axios.get(videosUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        videos: response.data.list || [],
        total: response.data.total,
        cursor: response.data.page,
        hasMore: response.data.has_more
      };
    } catch (error) {
      throw new Error(`获取播放列表视频失败: ${error.message}`);
    }
  }

  // 获取字幕
  async getSubtitles(videoId, language = 'en') {
    try {
      const subtitlesUrl = `https://api.dailymotion.com/video/${videoId}/subtitles`;
      const params = {
        fields: 'id,language,url'
      };

      const response = await axios.get(subtitlesUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const subtitles = response.data.list || [];
      const subtitle = subtitles.find(s => s.language === language) || subtitles[0];

      if (!subtitle) {
        throw new Error('未找到字幕');
      }

      const subtitleResponse = await axios.get(subtitle.url, this.getAxiosConfig());
      return {
        language: subtitle.language,
        content: subtitleResponse.data
      };
    } catch (error) {
      throw new Error(`获取字幕失败: ${error.message}`);
    }
  }
}

module.exports = new DailymotionPlatform();
