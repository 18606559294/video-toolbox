const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class XiaohongshuPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.xiaohongshu.com/',
      'Origin': 'https://www.xiaohongshu.com',
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('xiaohongshu.com') || url.includes('xhslink.com');
  }

  generateSign(path, data = '') {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(6).toString('hex');
    const str = `path=${path}&data=${data}&timestamp=${timestamp}&nonce=${nonce}`;
    const sign = crypto.createHash('sha256')
      .update(str + 'xhs-mobile-web')
      .digest('hex');

    return {
      timestamp,
      nonce,
      sign
    };
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://www.xiaohongshu.com/explore/{note_id}
    // https://xhslink.com/{short_id}
    const matches = url.match(/explore\/([^/?]+)/) || url.match(/xhslink\.com\/([^/?]+)/);
    if (!matches) {
      throw new Error('无效的小红书视频链接');
    }

    // 如果是短链接，需要解析重定向获取真实ID
    if (url.includes('xhslink.com')) {
      const response = await axios.get(url, {
        headers: this.headers,
        maxRedirects: 0,
        validateStatus: status => status === 302
      });
      const redirectUrl = response.headers.location;
      const realMatches = redirectUrl.match(/explore\/([^/?]+)/);
      if (!realMatches) {
        throw new Error('无法解析视频ID');
      }
      return realMatches[1];
    }

    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const noteId = await this.getVideoId(url);
      const path = `/api/sns/web/v1/feed`;
      const data = JSON.stringify({ note_id: noteId });
      const signData = this.generateSign(path, data);

      // 获取笔记信息
      const infoUrl = 'https://www.xiaohongshu.com' + path;
      const response = await axios.post(infoUrl, data, {
        headers: {
          ...this.headers,
          'X-Sign': signData.sign,
          'X-Timestamp': signData.timestamp,
          'X-Nonce': signData.nonce,
          'Content-Type': 'application/json'
        }
      });

      const noteData = response.data.data;
      if (!noteData || !noteData.note_card) {
        throw new Error('获取视频信息失败');
      }

      const note = noteData.note_card;
      if (!note.video) {
        throw new Error('该笔记不是视频类型');
      }

      const video = note.video;
      const formats = [];
      const streams = {};

      // 处理不同清晰度的视频
      if (video.media) {
        const qualities = [
          { name: '1080p', height: 1080 },
          { name: '720p', height: 720 },
          { name: '480p', height: 480 },
          { name: '360p', height: 360 }
        ];

        qualities.forEach(({ name, height }) => {
          if (video.media[name]) {
            formats.push({
              name,
              height,
              format: 'mp4'
            });
            streams[name] = video.media[name];
          }
        });
      }

      return {
        title: note.title || '小红书视频',
        duration: video.duration,
        coverUrl: note.cover.url,
        description: note.desc,
        author: note.user && note.user.nickname,
        publishTime: note.time,
        platform: 'xiaohongshu',
        noteId,
        formats,
        streams,
        likeCount: note.likes,
        commentCount: note.comments,
        shareCount: note.shared,
        collectionCount: note.collected,
        location: note.location,
        tags: note.tag_list,
        topics: note.topic_list
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

  // 获取笔记评论
  async getComments(noteId, cursor = '', count = 20) {
    try {
      const path = `/api/sns/web/v1/comment/page`;
      const data = JSON.stringify({
        note_id: noteId,
        cursor,
        size: count
      });
      const signData = this.generateSign(path, data);

      const commentUrl = 'https://www.xiaohongshu.com' + path;
      const response = await axios.post(commentUrl, data, {
        headers: {
          ...this.headers,
          'X-Sign': signData.sign,
          'X-Timestamp': signData.timestamp,
          'X-Nonce': signData.nonce,
          'Content-Type': 'application/json'
        }
      });

      return response.data.data || {};
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取相关推荐
  async getRecommendations(noteId) {
    try {
      const path = `/api/sns/web/v1/feed/related`;
      const data = JSON.stringify({ note_id: noteId });
      const signData = this.generateSign(path, data);

      const recommendUrl = 'https://www.xiaohongshu.com' + path;
      const response = await axios.post(recommendUrl, data, {
        headers: {
          ...this.headers,
          'X-Sign': signData.sign,
          'X-Timestamp': signData.timestamp,
          'X-Nonce': signData.nonce,
          'Content-Type': 'application/json'
        }
      });

      return response.data.data.notes || [];
    } catch (error) {
      throw new Error(`获取推荐笔记失败: ${error.message}`);
    }
  }

  // 获取用户笔记列表
  async getUserNotes(userId, cursor = '', count = 20) {
    try {
      const path = `/api/sns/web/v1/user/notes`;
      const data = JSON.stringify({
        user_id: userId,
        cursor,
        size: count
      });
      const signData = this.generateSign(path, data);

      const notesUrl = 'https://www.xiaohongshu.com' + path;
      const response = await axios.post(notesUrl, data, {
        headers: {
          ...this.headers,
          'X-Sign': signData.sign,
          'X-Timestamp': signData.timestamp,
          'X-Nonce': signData.nonce,
          'Content-Type': 'application/json'
        }
      });

      return response.data.data || {};
    } catch (error) {
      throw new Error(`获取用户笔记失败: ${error.message}`);
    }
  }

  // 获取用户收藏的笔记
  async getUserCollections(cursor = '', count = 20) {
    try {
      const path = `/api/sns/web/v1/user/collections`;
      const data = JSON.stringify({
        cursor,
        size: count
      });
      const signData = this.generateSign(path, data);

      const collectionsUrl = 'https://www.xiaohongshu.com' + path;
      const response = await axios.post(collectionsUrl, data, {
        headers: {
          ...this.headers,
          'X-Sign': signData.sign,
          'X-Timestamp': signData.timestamp,
          'X-Nonce': signData.nonce,
          'Content-Type': 'application/json'
        }
      });

      return response.data.data || {};
    } catch (error) {
      throw new Error(`获取收藏笔记失败: ${error.message}`);
    }
  }
}

module.exports = new XiaohongshuPlatform();
