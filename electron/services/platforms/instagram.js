const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');

class InstagramPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.instagram.com/',
      'X-IG-App-ID': '936619743392459',
      'Cookie': '' // 需要用户登录cookie
    };
    // 由于Instagram的地区限制，可能需要代理
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
    return url.includes('instagram.com/p/') || url.includes('instagram.com/reel/');
  }

  generateDeviceId() {
    return 'android-' + crypto.randomBytes(8).toString('hex');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.instagram.com/p/XXXXXX/
    // https://www.instagram.com/reel/XXXXXX/
    const matches = url.match(/\/(p|reel)\/([^/?]+)/);
    if (!matches) {
      throw new Error('无效的Instagram视频链接');
    }
    return matches[2];
  }

  async getVideoInfo(url) {
    try {
      const shortcode = await this.getVideoId(url);

      // 获取媒体信息
      const infoUrl = 'https://i.instagram.com/api/v1/media/' + shortcode + '/info/';
      const response = await axios.get(infoUrl, this.getAxiosConfig());

      const mediaInfo = response.data.items[0];
      if (!mediaInfo) {
        throw new Error('视频不存在或已被删除');
      }

      // 检查是否是视频
      if (!mediaInfo.video_versions && !mediaInfo.carousel_media) {
        throw new Error('该帖子不包含视频');
      }

      const formats = [];
      const streams = {};

      // 处理单个视频或轮播视频
      const videos = mediaInfo.video_versions || 
                    (mediaInfo.carousel_media && mediaInfo.carousel_media
                      .filter(m => m.video_versions)
                      .map(m => m.video_versions)
                      .flat()) || 
                    [];

      videos.forEach(video => {
        const height = video.height;
        let quality;
        if (height >= 1080) quality = '1080p';
        else if (height >= 720) quality = '720p';
        else if (height >= 480) quality = '480p';
        else quality = '360p';

        if (!streams[quality]) {
          formats.push({
            name: quality,
            height: video.height,
            width: video.width,
            format: 'mp4'
          });
          streams[quality] = video.url;
        }
      });

      // 获取封面图
      const coverUrl = mediaInfo.image_versions2.candidates[0].url;

      return {
        title: mediaInfo.caption?.text || 'Instagram视频',
        duration: mediaInfo.video_duration || 0,
        coverUrl,
        description: mediaInfo.caption?.text,
        author: mediaInfo.user.username,
        authorId: mediaInfo.user.pk,
        publishTime: mediaInfo.taken_at,
        platform: 'instagram',
        shortcode,
        formats,
        streams,
        isCarousel: !!mediaInfo.carousel_media,
        carouselItemCount: mediaInfo.carousel_media?.length,
        statistics: {
          likeCount: mediaInfo.like_count,
          commentCount: mediaInfo.comment_count,
          viewCount: mediaInfo.view_count,
          playCount: mediaInfo.play_count
        },
        location: mediaInfo.location,
        hashtags: (mediaInfo.caption?.text || '').match(/#[\w]+/g) || [],
        mentions: (mediaInfo.caption?.text || '').match(/@[\w]+/g) || []
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
  async getComments(shortcode, cursor = '', count = 20) {
    try {
      const commentUrl = 'https://i.instagram.com/api/v1/media/' + shortcode + '/comments/';
      const params = {
        can_support_threading: true,
        max_id: cursor,
        count
      };

      const response = await axios.get(commentUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        comments: response.data.comments || [],
        cursor: response.data.next_max_id,
        hasMore: !!response.data.next_max_id
      };
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(username) {
    try {
      const userUrl = 'https://i.instagram.com/api/v1/users/web_profile_info/';
      const params = {
        username
      };

      const response = await axios.get(userUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const user = response.data.data.user;
      return {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        biography: user.biography,
        followingCount: user.edge_follow.count,
        followerCount: user.edge_followed_by.count,
        mediaCount: user.edge_owner_to_timeline_media.count,
        isPrivate: user.is_private,
        isVerified: user.is_verified,
        profilePicUrl: user.profile_pic_url_hd
      };
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 获取用户媒体列表
  async getUserMedia(userId, cursor = '', count = 20) {
    try {
      const mediaUrl = 'https://i.instagram.com/api/v1/feed/user/' + userId + '/';
      const params = {
        max_id: cursor,
        count
      };

      const response = await axios.get(mediaUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        items: response.data.items || [],
        cursor: response.data.next_max_id,
        hasMore: !!response.data.next_max_id
      };
    } catch (error) {
      throw new Error(`获取用户媒体列表失败: ${error.message}`);
    }
  }

  // 获取标签媒体列表
  async getTagMedia(tag, cursor = '', count = 20) {
    try {
      const tagUrl = 'https://i.instagram.com/api/v1/tags/' + tag + '/sections/';
      const params = {
        max_id: cursor,
        page: count
      };

      const response = await axios.get(tagUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        sections: response.data.sections || [],
        cursor: response.data.next_max_id,
        hasMore: !!response.data.next_max_id
      };
    } catch (error) {
      throw new Error(`获取标签媒体列表失败: ${error.message}`);
    }
  }

  // 获取位置媒体列表
  async getLocationMedia(locationId, cursor = '', count = 20) {
    try {
      const locationUrl = 'https://i.instagram.com/api/v1/locations/' + locationId + '/sections/';
      const params = {
        max_id: cursor,
        page: count
      };

      const response = await axios.get(locationUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        sections: response.data.sections || [],
        cursor: response.data.next_max_id,
        hasMore: !!response.data.next_max_id
      };
    } catch (error) {
      throw new Error(`获取位置媒体列表失败: ${error.message}`);
    }
  }
}

module.exports = new InstagramPlatform();
