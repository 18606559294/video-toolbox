const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');

class TwitterPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'x-guest-token': '',
      'Cookie': '' // 需要用户登录cookie
    };
    this.proxy = null;
    this.guestToken = null;
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
    return url.includes('twitter.com') || url.includes('x.com');
  }

  async refreshGuestToken() {
    const response = await axios.post('https://api.twitter.com/1.1/guest/activate.json', {}, {
      headers: {
        'Authorization': this.headers.Authorization
      }
    });
    this.guestToken = response.data.guest_token;
    this.headers['x-guest-token'] = this.guestToken;
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://twitter.com/username/status/1234567890123456789
    // https://x.com/username/status/1234567890123456789
    const matches = url.match(/status\/(\d+)/);
    if (!matches) {
      throw new Error('无效的Twitter视频链接');
    }
    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const tweetId = await this.getVideoId(url);

      if (!this.guestToken) {
        await this.refreshGuestToken();
      }

      // 获取推文信息
      const apiUrl = 'https://api.twitter.com/1.1/statuses/show.json';
      const params = {
        id: tweetId,
        tweet_mode: 'extended',
        include_entities: true
      };

      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const tweet = response.data;
      if (!tweet.extended_entities?.media?.[0]?.video_info) {
        throw new Error('该推文不包含视频');
      }

      const video = tweet.extended_entities.media[0];
      const videoInfo = video.video_info;

      // 处理不同清晰度的视频
      const formats = [];
      const streams = {};

      videoInfo.variants
        .filter(v => v.content_type === 'video/mp4')
        .forEach(variant => {
          const bitrate = variant.bitrate;
          let quality;
          
          if (bitrate >= 2000000) quality = '1080p';
          else if (bitrate >= 1000000) quality = '720p';
          else if (bitrate >= 500000) quality = '480p';
          else quality = '360p';

          formats.push({
            name: quality,
            bitrate,
            format: 'mp4'
          });
          streams[quality] = variant.url;
        });

      return {
        title: tweet.full_text || tweet.text || 'Twitter视频',
        duration: videoInfo.duration_millis / 1000,
        coverUrl: video.media_url_https,
        description: tweet.full_text || tweet.text,
        author: tweet.user.name,
        authorId: tweet.user.id_str,
        authorUsername: tweet.user.screen_name,
        publishTime: new Date(tweet.created_at).getTime(),
        platform: 'twitter',
        tweetId,
        formats,
        streams,
        statistics: {
          retweetCount: tweet.retweet_count,
          favoriteCount: tweet.favorite_count,
          replyCount: tweet.reply_count,
          quoteCount: tweet.quote_count,
          viewCount: tweet.view_count
        },
        hashtags: tweet.entities.hashtags.map(h => h.text),
        mentions: tweet.entities.user_mentions.map(u => u.screen_name),
        urls: tweet.entities.urls.map(u => u.expanded_url),
        isRetweet: !!tweet.retweeted_status,
        isQuote: !!tweet.quoted_status,
        language: tweet.lang
      };
    } catch (error) {
      if (error.response?.status === 401) {
        await this.refreshGuestToken();
        return this.getVideoInfo(url);
      }
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

  // 获取评论（回复）
  async getReplies(tweetId, cursor = '', count = 20) {
    try {
      if (!this.guestToken) {
        await this.refreshGuestToken();
      }

      const apiUrl = 'https://api.twitter.com/2/timeline/conversation/' + tweetId + '.json';
      const params = {
        tweet_mode: 'extended',
        include_entities: true,
        count,
        cursor
      };

      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        replies: response.data.globalObjects.tweets || {},
        users: response.data.globalObjects.users || {},
        cursor: response.data.timeline.instructions[0]?.addEntries?.entries?.pop()?.content?.operation?.cursor?.value,
        hasMore: !!response.data.timeline.instructions[0]?.addEntries?.entries?.pop()?.content?.operation?.cursor?.value
      };
    } catch (error) {
      if (error.response?.status === 401) {
        await this.refreshGuestToken();
        return this.getReplies(tweetId, cursor, count);
      }
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(username) {
    try {
      if (!this.guestToken) {
        await this.refreshGuestToken();
      }

      const apiUrl = 'https://api.twitter.com/1.1/users/show.json';
      const params = {
        screen_name: username
      };

      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        params
      });

      const user = response.data;
      return {
        id: user.id_str,
        username: user.screen_name,
        name: user.name,
        description: user.description,
        location: user.location,
        url: user.url,
        protected: user.protected,
        verified: user.verified,
        followersCount: user.followers_count,
        friendsCount: user.friends_count,
        listedCount: user.listed_count,
        favouritesCount: user.favourites_count,
        statusesCount: user.statuses_count,
        createdAt: user.created_at,
        profileImageUrl: user.profile_image_url_https,
        profileBannerUrl: user.profile_banner_url,
        defaultProfile: user.default_profile,
        defaultProfileImage: user.default_profile_image
      };
    } catch (error) {
      if (error.response?.status === 401) {
        await this.refreshGuestToken();
        return this.getUserInfo(username);
      }
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 获取用户时间线
  async getUserTimeline(username, cursor = '', count = 20) {
    try {
      if (!this.guestToken) {
        await this.refreshGuestToken();
      }

      const apiUrl = 'https://api.twitter.com/1.1/statuses/user_timeline.json';
      const params = {
        screen_name: username,
        count,
        max_id: cursor,
        include_entities: true,
        tweet_mode: 'extended'
      };

      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        tweets: response.data,
        cursor: response.data.length > 0 ? response.data[response.data.length - 1].id_str : null,
        hasMore: response.data.length === count
      };
    } catch (error) {
      if (error.response?.status === 401) {
        await this.refreshGuestToken();
        return this.getUserTimeline(username, cursor, count);
      }
      throw new Error(`获取用户时间线失败: ${error.message}`);
    }
  }

  // 获取话题相关推文
  async getHashtagTweets(hashtag, cursor = '', count = 20) {
    try {
      if (!this.guestToken) {
        await this.refreshGuestToken();
      }

      const apiUrl = 'https://api.twitter.com/1.1/search/tweets.json';
      const params = {
        q: `#${hashtag} filter:videos`,
        count,
        max_id: cursor,
        include_entities: true,
        tweet_mode: 'extended'
      };

      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        tweets: response.data.statuses,
        cursor: response.data.search_metadata.next_results ? 
          response.data.search_metadata.next_results.match(/max_id=(\d+)/)[1] : 
          null,
        hasMore: !!response.data.search_metadata.next_results
      };
    } catch (error) {
      if (error.response?.status === 401) {
        await this.refreshGuestToken();
        return this.getHashtagTweets(hashtag, cursor, count);
      }
      throw new Error(`获取话题相关推文失败: ${error.message}`);
    }
  }

  // 获取转发用户
  async getRetweets(tweetId, cursor = '', count = 20) {
    try {
      if (!this.guestToken) {
        await this.refreshGuestToken();
      }

      const apiUrl = 'https://api.twitter.com/1.1/statuses/retweets/' + tweetId + '.json';
      const params = {
        count,
        cursor
      };

      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        retweets: response.data,
        cursor: null, // Twitter API 不支持转发列表分页
        hasMore: false
      };
    } catch (error) {
      if (error.response?.status === 401) {
        await this.refreshGuestToken();
        return this.getRetweets(tweetId, cursor, count);
      }
      throw new Error(`获取转发用户失败: ${error.message}`);
    }
  }

  // 获取喜欢的用户
  async getLikes(tweetId, cursor = '', count = 20) {
    try {
      if (!this.guestToken) {
        await this.refreshGuestToken();
      }

      const apiUrl = 'https://api.twitter.com/1.1/favorites/list.json';
      const params = {
        id: tweetId,
        count,
        max_id: cursor
      };

      const response = await axios.get(apiUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        likes: response.data,
        cursor: response.data.length > 0 ? response.data[response.data.length - 1].id_str : null,
        hasMore: response.data.length === count
      };
    } catch (error) {
      if (error.response?.status === 401) {
        await this.refreshGuestToken();
        return this.getLikes(tweetId, cursor, count);
      }
      throw new Error(`获取喜欢的用户失败: ${error.message}`);
    }
  }
}

module.exports = new TwitterPlatform();
