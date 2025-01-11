const BasePlatform = require('./base');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

class LinkedInPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Cookie': '', // 需要用户登录cookie
      'Csrf-Token': '', // LinkedIn需要CSRF token
      'x-li-lang': 'en_US'
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
    return url.includes('linkedin.com/posts') || url.includes('linkedin.com/feed/update');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.linkedin.com/posts/username_activity-1234567890123456789-abcd
    // https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789
    const matches = url.match(/activity[:\-](\d+)/) || url.match(/urn:li:activity:(\d+)/);
    if (!matches) {
      throw new Error('无效的LinkedIn视频链接');
    }
    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const activityId = await this.getVideoId(url);

      // 获取帖子信息
      const apiUrl = 'https://www.linkedin.com/voyager/api/feed/updates/' + activityId;
      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        headers: {
          ...this.headers,
          'x-restli-protocol-version': '2.0.0'
        }
      });

      const post = response.data;
      if (!post.content || !post.content.type === 'com.linkedin.ugc.MemberShareMediaCategory.VIDEO') {
        throw new Error('该帖子不包含视频');
      }

      const videoData = post.content.media[0];
      
      // 处理不同清晰度的视频
      const formats = [];
      const streams = {};

      if (videoData.artifacts) {
        videoData.artifacts.forEach(artifact => {
          let quality;
          if (artifact.height >= 1080) quality = '1080p';
          else if (artifact.height >= 720) quality = '720p';
          else if (artifact.height >= 480) quality = '480p';
          else quality = '360p';

          formats.push({
            name: quality,
            height: artifact.height,
            width: artifact.width,
            format: 'mp4'
          });
          streams[quality] = artifact.fileUrn;
        });
      }

      return {
        title: post.content.title || 'LinkedIn视频',
        duration: videoData.duration || 0,
        coverUrl: videoData.thumbnails[0]?.url,
        description: post.content.description,
        author: post.actor.name,
        authorId: post.actor.id,
        publishTime: post.published,
        platform: 'linkedin',
        activityId,
        formats,
        streams,
        statistics: {
          likeCount: post.socialDetail?.totalSocialActivityCounts?.numLikes || 0,
          commentCount: post.socialDetail?.totalSocialActivityCounts?.numComments || 0,
          shareCount: post.socialDetail?.totalSocialActivityCounts?.numShares || 0
        },
        visibility: post.visibility.text,
        language: post.content.language || 'en',
        isPromoted: post.sponsored || false
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  async download(url, options = {}) {
    try {
      const info = await this.getVideoInfo(url);
      const quality = options.quality || Object.keys(info.streams)[0];
      const videoUrn = info.streams[quality];

      if (!videoUrn) {
        throw new Error('未找到可用的视频流');
      }

      // 获取实际的视频URL
      const manifestUrl = 'https://www.linkedin.com/voyager/api/media/' + videoUrn;
      const manifestResponse = await axios.get(manifestUrl, {
        ...this.getAxiosConfig(),
        headers: {
          ...this.headers,
          'x-restli-protocol-version': '2.0.0'
        }
      });

      const videoUrl = manifestResponse.data.elements[0].identifiers[0].identifier;

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
  async getComments(activityId, cursor = '', count = 20) {
    try {
      const commentsUrl = 'https://www.linkedin.com/voyager/api/feed/comments';
      const params = {
        count,
        start: cursor,
        updateId: `urn:li:activity:${activityId}`
      };

      const response = await axios.get(commentsUrl, {
        ...this.getAxiosConfig(),
        params,
        headers: {
          ...this.headers,
          'x-restli-protocol-version': '2.0.0'
        }
      });

      return {
        comments: response.data.elements || [],
        cursor: response.data.paging?.start,
        hasMore: response.data.paging?.total > (parseInt(cursor) || 0) + count
      };
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(username) {
    try {
      const userUrl = 'https://www.linkedin.com/voyager/api/identity/profiles/' + username;
      const response = await axios.get(userUrl, {
        ...this.getAxiosConfig(),
        headers: {
          ...this.headers,
          'x-restli-protocol-version': '2.0.0'
        }
      });

      const profile = response.data;
      return {
        id: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        headline: profile.headline,
        summary: profile.summary,
        industryName: profile.industryName,
        locationName: profile.locationName,
        publicIdentifier: profile.publicIdentifier,
        profilePicture: profile.profilePicture?.displayImageReference?.vectorImage,
        backgroundPicture: profile.backgroundPicture?.displayImageReference?.vectorImage,
        followerCount: profile.followersCount,
        connectionCount: profile.connectionCount,
        isInfluencer: profile.influencer,
        companyName: profile.experience?.[0]?.companyName,
        schoolName: profile.education?.[0]?.schoolName
      };
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 获取用户帖子
  async getUserPosts(username, cursor = '', count = 20) {
    try {
      const postsUrl = 'https://www.linkedin.com/voyager/api/identity/profileUpdates';
      const params = {
        profileId: username,
        count,
        start: cursor,
        q: 'memberShareFeed'
      };

      const response = await axios.get(postsUrl, {
        ...this.getAxiosConfig(),
        params,
        headers: {
          ...this.headers,
          'x-restli-protocol-version': '2.0.0'
        }
      });

      return {
        posts: response.data.elements || [],
        cursor: response.data.paging?.start,
        hasMore: response.data.paging?.total > (parseInt(cursor) || 0) + count
      };
    } catch (error) {
      throw new Error(`获取用户帖子失败: ${error.message}`);
    }
  }

  // 获取相关帖子
  async getRelatedPosts(activityId, cursor = '', count = 20) {
    try {
      const relatedUrl = 'https://www.linkedin.com/voyager/api/feed/relevantFeed';
      const params = {
        updateId: `urn:li:activity:${activityId}`,
        count,
        start: cursor
      };

      const response = await axios.get(relatedUrl, {
        ...this.getAxiosConfig(),
        params,
        headers: {
          ...this.headers,
          'x-restli-protocol-version': '2.0.0'
        }
      });

      return {
        posts: response.data.elements || [],
        cursor: response.data.paging?.start,
        hasMore: response.data.paging?.total > (parseInt(cursor) || 0) + count
      };
    } catch (error) {
      throw new Error(`获取相关帖子失败: ${error.message}`);
    }
  }
}

module.exports = new LinkedInPlatform();
