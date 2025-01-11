const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class CCTVPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://tv.cctv.com/',
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('tv.cctv.com') || url.includes('cctv.com/video');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://tv.cctv.com/2025/01/12/VIDExxxxxxxxxxx.shtml
    // https://news.cctv.com/2025/01/12/VIDExxxxxxxxxxx.shtml
    const matches = url.match(/VIDE([a-zA-Z0-9]+)\.s?html/);
    if (!matches) {
      // 从页面内容获取guid
      const response = await axios.get(url, { headers: this.headers });
      const guidMatch = response.data.match(/guid\s*=\s*["']([^"']+)/);
      if (!guidMatch) {
        throw new Error('无效的央视网视频链接');
      }
      return guidMatch[1];
    }
    return matches[1];
  }

  generateSign(params) {
    const sorted = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return crypto.createHash('md5')
      .update(sorted + 'cctv-video-key')
      .digest('hex');
  }

  async getVideoInfo(url) {
    try {
      const guid = await this.getVideoId(url);
      const timestamp = Math.floor(Date.now() / 1000);

      // 获取视频信息
      const infoUrl = 'https://vdn.apps.cctv.cn/api/getHttpVideoInfo.do';
      const params = {
        pid: guid,
        client: 'web',
        im: 0,
        tsp: timestamp
      };

      params.vn = this.generateSign(params);

      const response = await axios.get(infoUrl, {
        params,
        headers: this.headers
      });

      const data = response.data;
      if (data.code !== '0') {
        throw new Error(data.msg || '获取视频信息失败');
      }

      const videoInfo = data.video;
      const chapters = videoInfo.chapters || [];

      // 处理多清晰度
      const qualities = ['standard', 'high', 'ultra'];
      const formats = [];
      const streams = {};

      qualities.forEach(quality => {
        if (chapters.some(ch => ch[quality])) {
          let height, name;
          switch (quality) {
            case 'ultra':
              height = 1080;
              name = '1080p';
              break;
            case 'high':
              height = 720;
              name = '720p';
              break;
            case 'standard':
              height = 480;
              name = '480p';
              break;
          }

          formats.push({
            name,
            height,
            format: 'mp4'
          });

          // 合并分段视频地址
          streams[name] = chapters.map(ch => ch[quality]).filter(Boolean);
        }
      });

      return {
        title: videoInfo.title,
        duration: videoInfo.duration,
        coverUrl: videoInfo.image,
        description: videoInfo.brief,
        category: videoInfo.channel,
        publishTime: videoInfo.time,
        platform: 'cctv',
        guid,
        formats,
        streams,
        isLive: videoInfo.isLive || false,
        channel: videoInfo.channel
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  async download(url, options = {}) {
    try {
      const info = await this.getVideoInfo(url);
      const quality = options.quality || Object.keys(info.streams)[0];
      const videoUrls = info.streams[quality];

      if (!videoUrls || videoUrls.length === 0) {
        throw new Error('未找到可用的视频流');
      }

      // 如果是分段视频，需要下载所有分段并合并
      const streams = [];
      let totalSize = 0;

      for (const videoUrl of videoUrls) {
        const response = await axios({
          method: 'GET',
          url: videoUrl,
          headers: {
            ...this.headers,
            'Range': 'bytes=0-'
          },
          responseType: 'stream'
        });

        streams.push(response.data);
        totalSize += parseInt(response.headers['content-length'] || 0);
      }

      return {
        stream: streams.length === 1 ? streams[0] : this.mergeStreams(streams),
        info: {
          ...info,
          size: totalSize,
          quality,
          segments: streams.length
        }
      };
    } catch (error) {
      throw new Error(`下载失败: ${error.message}`);
    }
  }

  // 合并多个流
  mergeStreams(streams) {
    const { PassThrough } = require('stream');
    const mergedStream = new PassThrough();

    const pushStream = (index) => {
      if (index >= streams.length) {
        mergedStream.end();
        return;
      }

      streams[index].on('end', () => pushStream(index + 1));
      streams[index].pipe(mergedStream, { end: false });
    };

    pushStream(0);
    return mergedStream;
  }

  // 获取节目单信息
  async getProgramSchedule(channel, date = new Date()) {
    try {
      const scheduleUrl = 'https://api.cctv.cn/lanmu/programInfo';
      const params = {
        channel,
        date: date.toISOString().split('T')[0]
      };

      const response = await axios.get(scheduleUrl, {
        params,
        headers: this.headers
      });

      return response.data.data || [];
    } catch (error) {
      throw new Error(`获取节目单失败: ${error.message}`);
    }
  }

  // 获取直播流
  async getLiveStream(channel) {
    try {
      const liveUrl = 'https://vdn.live.cntv.cn/api2/live.do';
      const params = {
        channel,
        client: 'web'
      };

      const response = await axios.get(liveUrl, {
        params,
        headers: this.headers
      });

      return response.data.hls_url || null;
    } catch (error) {
      throw new Error(`获取直播流失败: ${error.message}`);
    }
  }
}

module.exports = new CCTVPlatform();
