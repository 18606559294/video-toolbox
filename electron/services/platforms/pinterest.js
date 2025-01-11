const BasePlatform = require('./base');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

class PinterestPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.5',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': '', // 需要用户登录cookie
      'X-CSRFToken': '' // Pinterest需要CSRF token
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
    return url.includes('pinterest.com/pin/');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.pinterest.com/pin/123456789012345678
    const matches = url.match(/pin\/(\d+)/);
    if (!matches) {
      throw new Error('无效的Pinterest视频链接');
    }
    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const pinId = await this.getVideoId(url);

      // 获取Pin信息
      const apiUrl = 'https://www.pinterest.com/resource/PinResource/get/';
      const params = {
        source_url: `/pin/${pinId}/`,
        data: JSON.stringify({
          options: {
            id: pinId,
            field_set_key: 'detailed'
          }
        })
      };

      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const pin = response.data.resource_response.data;
      if (!pin.videos) {
        throw new Error('该Pin不包含视频');
      }

      // 处理不同清晰度的视频
      const formats = [];
      const streams = {};

      if (pin.videos.video_list) {
        Object.entries(pin.videos.video_list).forEach(([key, video]) => {
          let quality;
          if (video.height >= 1080) quality = '1080p';
          else if (video.height >= 720) quality = '720p';
          else if (video.height >= 480) quality = '480p';
          else quality = '360p';

          formats.push({
            name: quality,
            height: video.height,
            width: video.width,
            format: 'mp4'
          });
          streams[quality] = video.url;
        });
      }

      return {
        title: pin.title || pin.description || 'Pinterest视频',
        duration: pin.videos.video_list?.V_720P?.duration || 0,
        coverUrl: pin.images.orig.url,
        description: pin.description,
        author: pin.pinner.full_name,
        authorId: pin.pinner.id,
        authorUsername: pin.pinner.username,
        publishTime: pin.created_at,
        platform: 'pinterest',
        pinId,
        formats,
        streams,
        statistics: {
          saveCount: pin.repin_count,
          commentCount: pin.comment_count,
          reactCount: pin.reaction_counts?.total || 0
        },
        board: {
          id: pin.board.id,
          name: pin.board.name,
          url: pin.board.url
        },
        domain: pin.domain,
        link: pin.link,
        isPromoted: pin.is_promoted,
        isWhitelistedForTriedIt: pin.is_whitelisted_for_tried_it,
        hasProductPins: pin.has_product_pins,
        isEligibleForWebPdp: pin.is_eligible_for_web_pdp
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
  async getComments(pinId, cursor = '', count = 20) {
    try {
      const commentsUrl = 'https://www.pinterest.com/resource/PinCommentsResource/get/';
      const params = {
        source_url: `/pin/${pinId}/`,
        data: JSON.stringify({
          options: {
            pin_id: pinId,
            bookmark: cursor,
            page_size: count
          }
        })
      };

      const response = await axios.get(commentsUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        comments: response.data.resource_response.data || [],
        cursor: response.data.resource_response.bookmark,
        hasMore: !response.data.resource_response.bookmark_complete
      };
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(username) {
    try {
      const userUrl = 'https://www.pinterest.com/resource/UserResource/get/';
      const params = {
        source_url: `/${username}/`,
        data: JSON.stringify({
          options: {
            username: username,
            field_set_key: 'profile'
          }
        })
      };

      const response = await axios.get(userUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const user = response.data.resource_response.data;
      return {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        bio: user.about,
        website: user.website,
        location: user.location,
        followingCount: user.following_count,
        followerCount: user.follower_count,
        pinCount: user.pin_count,
        boardCount: user.board_count,
        profileImage: user.image_xlarge_url,
        isVerified: user.verified_identity,
        type: user.type,
        domain: user.domain,
        isPartner: user.is_partner
      };
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 获取用户Pins
  async getUserPins(username, cursor = '', count = 20) {
    try {
      const pinsUrl = 'https://www.pinterest.com/resource/UserPinsResource/get/';
      const params = {
        source_url: `/${username}/`,
        data: JSON.stringify({
          options: {
            username: username,
            bookmarks: [cursor],
            page_size: count
          }
        })
      };

      const response = await axios.get(pinsUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        pins: response.data.resource_response.data || [],
        cursor: response.data.resource_response.bookmark,
        hasMore: !response.data.resource_response.bookmark_complete
      };
    } catch (error) {
      throw new Error(`获取用户Pins失败: ${error.message}`);
    }
  }

  // 获取相关Pins
  async getRelatedPins(pinId, cursor = '', count = 20) {
    try {
      const relatedUrl = 'https://www.pinterest.com/resource/RelatedPinsResource/get/';
      const params = {
        source_url: `/pin/${pinId}/`,
        data: JSON.stringify({
          options: {
            pin_id: pinId,
            bookmarks: [cursor],
            page_size: count
          }
        })
      };

      const response = await axios.get(relatedUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        pins: response.data.resource_response.data || [],
        cursor: response.data.resource_response.bookmark,
        hasMore: !response.data.resource_response.bookmark_complete
      };
    } catch (error) {
      throw new Error(`获取相关Pins失败: ${error.message}`);
    }
  }

  // 获取Board信息
  async getBoardInfo(username, boardName) {
    try {
      const boardUrl = 'https://www.pinterest.com/resource/BoardResource/get/';
      const params = {
        source_url: `/${username}/${boardName}/`,
        data: JSON.stringify({
          options: {
            username: username,
            slug: boardName,
            field_set_key: 'detailed'
          }
        })
      };

      const response = await axios.get(boardUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const board = response.data.resource_response.data;
      return {
        id: board.id,
        name: board.name,
        description: board.description,
        url: board.url,
        owner: board.owner,
        privacy: board.privacy,
        category: board.category,
        collaborator_count: board.collaborator_count,
        follower_count: board.follower_count,
        pin_count: board.pin_count,
        thumbnail_images: board.thumbnail_images,
        created_at: board.created_at
      };
    } catch (error) {
      throw new Error(`获取Board信息失败: ${error.message}`);
    }
  }
}

module.exports = new PinterestPlatform();
