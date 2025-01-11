const BasePlatform = require('./base');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

class VimeoPlatform extends BasePlatform {
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
    return url.includes('vimeo.com/');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://vimeo.com/123456789
    // https://vimeo.com/channels/channelname/123456789
    // https://vimeo.com/groups/groupname/123456789
    // https://player.vimeo.com/video/123456789
    const matches = url.match(/vimeo\.com(?:\/(?:channels\/[^\/]+|groups\/[^\/]+))?\/(\d+)/);
    if (!matches) {
      throw new Error('无效的Vimeo视频链接');
    }
    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const videoId = await this.getVideoId(url);

      // 获取视频信息
      const configUrl = 'https://player.vimeo.com/video/' + videoId + '/config';
      const response = await axios.get(configUrl, this.getAxiosConfig());

      const videoData = response.data;
      if (!videoData.video) {
        throw new Error('无法获取视频信息');
      }

      const video = videoData.video;
      const player = videoData.player;
      const owner = videoData.video.owner;

      // 处理不同清晰度的视频
      const formats = [];
      const streams = {};

      if (player.progressive) {
        player.progressive.forEach(prog => {
          let quality;
          if (prog.height >= 1080) quality = '1080p';
          else if (prog.height >= 720) quality = '720p';
          else if (prog.height >= 480) quality = '480p';
          else quality = '360p';

          formats.push({
            name: quality,
            height: prog.height,
            width: prog.width,
            fps: prog.fps,
            format: 'mp4'
          });
          streams[quality] = prog.url;
        });
      }

      // 添加HLS流
      if (player.hls && player.hls.cdns) {
        Object.values(player.hls.cdns).forEach(cdn => {
          formats.push({
            name: 'adaptive',
            format: 'hls'
          });
          streams['adaptive'] = cdn.url;
        });
      }

      return {
        title: video.title,
        duration: video.duration,
        coverUrl: video.thumbs?.base || video.thumbs?.[960],
        description: video.description,
        author: owner.name,
        authorId: owner.id,
        authorUrl: owner.url,
        publishTime: video.upload_date,
        platform: 'vimeo',
        videoId,
        formats,
        streams,
        statistics: {
          viewCount: video.stats_number_of_plays,
          likeCount: video.stats_number_of_likes,
          commentCount: video.stats_number_of_comments
        },
        privacy: video.privacy.view,
        embed: video.embed_code,
        tags: video.tags,
        categories: video.categories,
        license: video.license,
        language: video.language,
        isLive: video.live_event,
        allowDownload: video.download,
        hasAudio: video.has_audio,
        is360: video.spatial,
        isHD: video.hd
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
      const commentsUrl = `https://api.vimeo.com/videos/${videoId}/comments`;
      const params = {
        page: cursor || 1,
        per_page: count,
        direction: 'asc'
      };

      const response = await axios.get(commentsUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        comments: response.data.data || [],
        total: response.data.total,
        cursor: response.data.page,
        hasMore: response.data.page * response.data.per_page < response.data.total
      };
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取用户信息
  async getUserInfo(userId) {
    try {
      const userUrl = `https://api.vimeo.com/users/${userId}`;
      const response = await axios.get(userUrl, this.getAxiosConfig());

      const user = response.data;
      return {
        id: user.uri.split('/').pop(),
        name: user.name,
        bio: user.bio,
        shortBio: user.short_bio,
        location: user.location,
        url: user.link,
        createdTime: user.created_time,
        pictures: user.pictures,
        websites: user.websites,
        stats: {
          videoCount: user.stats.videos,
          followersCount: user.stats.followers,
          followingCount: user.stats.following,
          albumCount: user.stats.albums,
          appearancesCount: user.stats.appearances,
          likesCount: user.stats.likes,
          channelsCount: user.stats.channels
        },
        preferences: {
          videos: user.preferences.videos
        },
        contentFilter: user.content_filter,
        uploadQuota: user.upload_quota,
        isPlusUser: user.account === 'plus',
        isProUser: user.account === 'pro',
        isBusinessUser: user.account === 'business'
      };
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 获取用户视频
  async getUserVideos(userId, cursor = '', count = 20) {
    try {
      const videosUrl = `https://api.vimeo.com/users/${userId}/videos`;
      const params = {
        page: cursor || 1,
        per_page: count,
        sort: 'date',
        direction: 'desc'
      };

      const response = await axios.get(videosUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        videos: response.data.data || [],
        total: response.data.total,
        cursor: response.data.page,
        hasMore: response.data.page * response.data.per_page < response.data.total
      };
    } catch (error) {
      throw new Error(`获取用户视频失败: ${error.message}`);
    }
  }

  // 获取相关视频
  async getRelatedVideos(videoId, cursor = '', count = 20) {
    try {
      const relatedUrl = `https://api.vimeo.com/videos/${videoId}/related`;
      const params = {
        page: cursor || 1,
        per_page: count
      };

      const response = await axios.get(relatedUrl, {
        ...this.getAxiosConfig(),
        params
      });

      return {
        videos: response.data.data || [],
        total: response.data.total,
        cursor: response.data.page,
        hasMore: response.data.page * response.data.per_page < response.data.total
      };
    } catch (error) {
      throw new Error(`获取相关视频失败: ${error.message}`);
    }
  }

  // 获取字幕
  async getSubtitles(videoId, language = 'en') {
    try {
      const textTracksUrl = `https://api.vimeo.com/videos/${videoId}/texttracks`;
      const response = await axios.get(textTracksUrl, this.getAxiosConfig());

      const tracks = response.data.data || [];
      const track = tracks.find(t => t.language === language) || tracks[0];

      if (!track) {
        throw new Error('未找到字幕');
      }

      const subtitleResponse = await axios.get(track.link, this.getAxiosConfig());
      return {
        language: track.language,
        kind: track.kind,
        content: subtitleResponse.data
      };
    } catch (error) {
      throw new Error(`获取字幕失败: ${error.message}`);
    }
  }

  // 获取章节信息
  async getChapters(videoId) {
    try {
      const chaptersUrl = `https://api.vimeo.com/videos/${videoId}/chapters`;
      const response = await axios.get(chaptersUrl, this.getAxiosConfig());

      return response.data.data || [];
    } catch (error) {
      throw new Error(`获取章节信息失败: ${error.message}`);
    }
  }
}

module.exports = new VimeoPlatform();
