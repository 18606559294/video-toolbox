const BasePlatform = require('./base');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

class FacebookPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Cookie': '' // 需要用户登录cookie
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
    return url.includes('facebook.com') || url.includes('fb.watch');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.facebook.com/username/videos/1234567890
    // https://fb.watch/abc123
    // https://www.facebook.com/watch/?v=1234567890
    let matches = url.match(/\/videos\/(\d+)/);
    if (!matches) {
      matches = url.match(/watch\/?\?v=(\d+)/);
    }
    
    if (!matches && url.includes('fb.watch')) {
      // 解析短链接
      const response = await axios.get(url, {
        ...this.getAxiosConfig(),
        maxRedirects: 0,
        validateStatus: status => status === 301 || status === 302
      });
      const redirectUrl = response.headers.location;
      matches = redirectUrl.match(/\/videos\/(\d+)/) || redirectUrl.match(/watch\/?\?v=(\d+)/);
    }

    if (!matches) {
      throw new Error('无效的Facebook视频链接');
    }
    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const videoId = await this.getVideoId(url);

      // 获取视频页面
      const pageUrl = 'https://www.facebook.com/watch/?v=' + videoId;
      const response = await axios.get(pageUrl, this.getAxiosConfig());

      // 从页面提取视频信息
      const html = response.data;
      
      // 提取视频信息
      const videoData = this.extractVideoData(html);
      if (!videoData) {
        throw new Error('无法获取视频信息');
      }

      // 处理不同清晰度的视频
      const formats = [];
      const streams = {};

      if (videoData.videoData) {
        const qualities = videoData.videoData.videoQualities || [];
        qualities.forEach(quality => {
          let qualityName;
          if (quality.height >= 1080) qualityName = '1080p';
          else if (quality.height >= 720) qualityName = '720p';
          else if (quality.height >= 480) qualityName = '480p';
          else qualityName = '360p';

          formats.push({
            name: qualityName,
            height: quality.height,
            width: quality.width,
            format: 'mp4'
          });
          streams[qualityName] = quality.url;
        });
      }

      return {
        title: videoData.title || 'Facebook视频',
        duration: videoData.duration || 0,
        coverUrl: videoData.thumbnail_url,
        description: videoData.description,
        author: videoData.owner?.name,
        authorId: videoData.owner?.id,
        publishTime: videoData.publish_time,
        platform: 'facebook',
        videoId,
        formats,
        streams,
        statistics: {
          viewCount: videoData.view_count,
          likeCount: videoData.like_count,
          commentCount: videoData.comment_count,
          shareCount: videoData.share_count
        },
        privacy: videoData.privacy_setting,
        isLive: videoData.is_live_streaming,
        category: videoData.category,
        language: videoData.language
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  extractVideoData(html) {
    try {
      // 提取视频数据
      const dataMatch = html.match(/"videoData":\s*({[^}]+})/);
      if (!dataMatch) return null;

      const videoData = JSON.parse(dataMatch[1]);
      return videoData;
    } catch (error) {
      return null;
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
      const commentsUrl = 'https://www.facebook.com/api/graphql/';
      const variables = {
        videoId,
        cursor,
        count,
        feedbackSource: 0,
        feedLocation: 'VIDEO_PERMALINK',
        includeNestedComments: true
      };

      const response = await axios.post(commentsUrl, {
        variables: JSON.stringify(variables),
        doc_id: '12345' // Facebook的评论API需要特定的doc_id
      }, this.getAxiosConfig());

      return {
        comments: response.data.data.video.comments.edges || [],
        pageInfo: response.data.data.video.comments.page_info,
        cursor: response.data.data.video.comments.page_info?.end_cursor,
        hasMore: response.data.data.video.comments.page_info?.has_next_page
      };
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(username) {
    try {
      const userUrl = 'https://www.facebook.com/' + username;
      const response = await axios.get(userUrl, this.getAxiosConfig());

      // 从页面提取用户信息
      const userData = this.extractUserData(response.data);
      if (!userData) {
        throw new Error('无法获取用户信息');
      }

      return {
        id: userData.id,
        username: userData.username,
        name: userData.name,
        category: userData.category,
        isVerified: userData.is_verified,
        followerCount: userData.follower_count,
        likeCount: userData.fan_count,
        description: userData.description,
        website: userData.website,
        location: userData.location,
        coverUrl: userData.cover?.source,
        profilePictureUrl: userData.profile_picture?.uri
      };
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  extractUserData(html) {
    try {
      // 提取用户数据
      const dataMatch = html.match(/"profile_info":\s*({[^}]+})/);
      if (!dataMatch) return null;

      const userData = JSON.parse(dataMatch[1]);
      return userData;
    } catch (error) {
      return null;
    }
  }

  // 获取用户视频列表
  async getUserVideos(userId, cursor = '', count = 20) {
    try {
      const videosUrl = 'https://www.facebook.com/api/graphql/';
      const variables = {
        userId,
        cursor,
        count,
        environment: 'VIDEO_VIEWER',
        feedLocation: 'VIDEO_CHANNEL'
      };

      const response = await axios.post(videosUrl, {
        variables: JSON.stringify(variables),
        doc_id: '67890' // Facebook的视频列表API需要特定的doc_id
      }, this.getAxiosConfig());

      return {
        videos: response.data.data.user.videos.edges || [],
        pageInfo: response.data.data.user.videos.page_info,
        cursor: response.data.data.user.videos.page_info?.end_cursor,
        hasMore: response.data.data.user.videos.page_info?.has_next_page
      };
    } catch (error) {
      throw new Error(`获取用户视频列表失败: ${error.message}`);
    }
  }

  // 获取相关视频
  async getRelatedVideos(videoId, cursor = '', count = 20) {
    try {
      const relatedUrl = 'https://www.facebook.com/api/graphql/';
      const variables = {
        videoId,
        cursor,
        count,
        environment: 'VIDEO_VIEWER',
        feedLocation: 'VIDEO_PERMALINK'
      };

      const response = await axios.post(relatedUrl, {
        variables: JSON.stringify(variables),
        doc_id: '13579' // Facebook的相关视频API需要特定的doc_id
      }, this.getAxiosConfig());

      return {
        videos: response.data.data.video.related_videos.edges || [],
        pageInfo: response.data.data.video.related_videos.page_info,
        cursor: response.data.data.video.related_videos.page_info?.end_cursor,
        hasMore: response.data.data.video.related_videos.page_info?.has_next_page
      };
    } catch (error) {
      throw new Error(`获取相关视频失败: ${error.message}`);
    }
  }

  // 获取直播信息
  async getLiveInfo(videoId) {
    try {
      const liveUrl = 'https://www.facebook.com/api/graphql/';
      const variables = {
        videoId,
        feedLocation: 'VIDEO_PERMALINK',
        includeStreamHealth: true
      };

      const response = await axios.post(liveUrl, {
        variables: JSON.stringify(variables),
        doc_id: '24680' // Facebook的直播API需要特定的doc_id
      }, this.getAxiosConfig());

      const liveData = response.data.data.video;
      return {
        isLive: liveData.is_live_streaming,
        viewerCount: liveData.live_viewer_count,
        startTime: liveData.live_broadcast_start_time,
        streamHealth: liveData.stream_health,
        playbackUrl: liveData.playback_url,
        dashManifest: liveData.dash_manifest,
        hlsUrl: liveData.hls_url
      };
    } catch (error) {
      throw new Error(`获取直播信息失败: ${error.message}`);
    }
  }
}

module.exports = new FacebookPlatform();
