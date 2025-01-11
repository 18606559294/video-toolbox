const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');

class TikTokPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.tiktok.com/',
      'Cookie': '' // 需要用户登录cookie
    };
    // 由于TikTok的地区限制，可能需要代理
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
    return url.includes('tiktok.com') || url.includes('vm.tiktok.com');
  }

  generateVerifyFp() {
    const e = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const t = Date.now();
    const n = "verify_";
    let r = "";
    for (let i = 0; i < 36; i++) {
      r += e[Math.floor(Math.random() * e.length)];
    }
    return n + t + r;
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.tiktok.com/@username/video/1234567890123456789
    // https://vm.tiktok.com/XXXXXXXXXX/
    const matches = url.match(/video\/(\d+)/) || url.match(/vm\.tiktok\.com\/([^/?]+)/);
    if (!matches) {
      throw new Error('无效的TikTok视频链接');
    }

    // 如果是短链接，需要解析重定向获取真实ID
    if (url.includes('vm.tiktok.com')) {
      const response = await axios.get(url, {
        ...this.getAxiosConfig(),
        maxRedirects: 0,
        validateStatus: status => status === 301 || status === 302
      });
      const redirectUrl = response.headers.location;
      const realMatches = redirectUrl.match(/video\/(\d+)/);
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
      const verifyFp = this.generateVerifyFp();

      // 获取视频信息
      const msToken = crypto.randomBytes(16).toString('hex');
      const infoUrl = 'https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/';
      const params = {
        aweme_id: videoId,
        version_code: '26.1.3',
        app_name: 'tiktok_web',
        device_platform: 'web',
        aid: '1988',
        msToken,
        _signature': this.generateSignature(videoId, msToken),
        verifyFp
      };

      const response = await axios.get(infoUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const aweme = response.data.aweme_list[0];
      if (!aweme) {
        throw new Error('视频不存在或已被删除');
      }

      // 处理不同清晰度的视频
      const video = aweme.video;
      const formats = [];
      const streams = {};

      const qualities = [
        { name: '1080p', url_key: 'play_addr_h264' },
        { name: '720p', url_key: 'play_addr' },
        { name: '480p', url_key: 'play_addr_lowbr' }
      ];

      qualities.forEach(({ name, url_key }) => {
        if (video[url_key] && video[url_key].url_list && video[url_key].url_list.length > 0) {
          formats.push({
            name,
            format: 'mp4'
          });
          streams[name] = video[url_key].url_list[0];
        }
      });

      return {
        title: aweme.desc || 'TikTok视频',
        duration: video.duration / 1000,
        coverUrl: aweme.video.cover.url_list[0],
        description: aweme.desc,
        author: aweme.author.nickname,
        authorId: aweme.author.uid,
        publishTime: aweme.create_time,
        platform: 'tiktok',
        videoId,
        formats,
        streams,
        statistics: {
          playCount: aweme.statistics.play_count,
          diggCount: aweme.statistics.digg_count,
          shareCount: aweme.statistics.share_count,
          commentCount: aweme.statistics.comment_count
        },
        music: {
          id: aweme.music.id,
          title: aweme.music.title,
          author: aweme.music.author,
          coverUrl: aweme.music.cover_large.url_list[0],
          duration: aweme.music.duration,
          url: aweme.music.play_url.url_list[0]
        },
        hashtags: aweme.text_extra.filter(t => t.hashtag_name).map(t => t.hashtag_name)
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
  async getComments(videoId, cursor = 0, count = 20) {
    try {
      const commentUrl = 'https://api16-normal-c-useast1a.tiktokv.com/aweme/v2/comment/list/';
      const params = {
        aweme_id: videoId,
        cursor,
        count,
        device_platform: 'web',
        aid: '1988'
      };

      const response = await axios.get(commentUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        comments: response.data.comments || [],
        cursor: response.data.cursor,
        hasMore: response.data.has_more
      };
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(username) {
    try {
      const userUrl = 'https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/user/profile/other/';
      const params = {
        unique_id: username,
        device_platform: 'web',
        aid: '1988'
      };

      const response = await axios.get(userUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const user = response.data.user;
      return {
        id: user.uid,
        nickname: user.nickname,
        avatarUrl: user.avatar_larger.url_list[0],
        signature: user.signature,
        followingCount: user.following_count,
        followerCount: user.follower_count,
        likeCount: user.total_favorited,
        videoCount: user.aweme_count,
        verified: user.custom_verify || user.enterprise_verify_reason
      };
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 获取用户视频列表
  async getUserVideos(userId, cursor = 0, count = 20) {
    try {
      const videosUrl = 'https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/aweme/post/';
      const params = {
        user_id: userId,
        max_cursor: cursor,
        count,
        device_platform: 'web',
        aid: '1988'
      };

      const response = await axios.get(videosUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        videos: response.data.aweme_list || [],
        cursor: response.data.max_cursor,
        hasMore: response.data.has_more
      };
    } catch (error) {
      throw new Error(`获取用户视频列表失败: ${error.message}`);
    }
  }

  // 获取音乐相关视频
  async getMusicVideos(musicId, cursor = 0, count = 20) {
    try {
      const musicUrl = 'https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/music/aweme/';
      const params = {
        music_id: musicId,
        cursor,
        count,
        device_platform: 'web',
        aid: '1988'
      };

      const response = await axios.get(musicUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        videos: response.data.aweme_list || [],
        cursor: response.data.cursor,
        hasMore: response.data.has_more
      };
    } catch (error) {
      throw new Error(`获取音乐相关视频失败: ${error.message}`);
    }
  }

  // 获取话题相关视频
  async getHashtagVideos(hashtag, cursor = 0, count = 20) {
    try {
      const hashtagUrl = 'https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/challenge/aweme/';
      const params = {
        ch_id: hashtag,
        cursor,
        count,
        device_platform: 'web',
        aid: '1988'
      };

      const response = await axios.get(hashtagUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        videos: response.data.aweme_list || [],
        cursor: response.data.cursor,
        hasMore: response.data.has_more
      };
    } catch (error) {
      throw new Error(`获取话题相关视频失败: ${error.message}`);
    }
  }
}

module.exports = new TikTokPlatform();
