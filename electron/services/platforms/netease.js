const BasePlatform = require('./base');
const axios = require('axios');
const crypto = require('crypto');

class NeteasePlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://music.163.com/',
      'Origin': 'https://music.163.com',
      'Cookie': '' // 需要用户登录cookie
    };
  }

  isMatch(url) {
    return url.includes('music.163.com/mv') || url.includes('music.163.com/#/mv');
  }

  async getVideoId(url) {
    // 支持的URL格式：
    // https://music.163.com/#/mv?id=xxxxx
    // https://music.163.com/mv/xxxxx
    const matches = url.match(/mv\?id=(\d+)/) || url.match(/mv\/(\d+)/);
    if (!matches) {
      throw new Error('无效的网易云视频链接');
    }
    return matches[1];
  }

  generateNeteaseParams(params) {
    // 网易云API加密参数生成
    const secretKey = '0CoJUm6Qyw8W8jud';
    const encSecKey = '257348aecb5e556c066de214e531faadd1c55d814f9be95fd06d6bff9f4c7a41f831f6394d5a3fd2e3881736d94a02ca919d952872e7d0a50ebfa1769a7a62d512f5f1ca21aec60bc3819a9c3ffca5eca9a0dba6d6f7249b06f5965ecfff3695b54e1c28f3f624750ed39e7de08fc8493242e26dbc4484a01c76f739e135637c';
    
    const data = JSON.stringify(params);
    const iv = '0102030405060708';
    
    // AES加密
    const cipher = crypto.createCipheriv('aes-128-cbc', secretKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return {
      params: encrypted,
      encSecKey
    };
  }

  async getVideoInfo(url) {
    try {
      const mvid = await this.getVideoId(url);

      // 获取MV详细信息
      const detailUrl = 'https://music.163.com/weapi/v1/mv/detail';
      const detailParams = this.generateNeteaseParams({
        id: mvid,
        csrf_token: ''
      });

      const detailResponse = await axios.post(detailUrl, new URLSearchParams(detailParams), {
        headers: {
          ...this.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const mvData = detailResponse.data.data;

      // 获取MV播放地址
      const urlUrl = 'https://music.163.com/weapi/song/enhance/play/mv/url';
      const urlParams = this.generateNeteaseParams({
        id: mvid,
        r: '1080',
        csrf_token: ''
      });

      const urlResponse = await axios.post(urlUrl, new URLSearchParams(urlParams), {
        headers: {
          ...this.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const urlData = urlResponse.data.data;

      return {
        title: mvData.name,
        duration: Math.floor(mvData.duration / 1000),
        coverUrl: mvData.cover,
        description: mvData.desc,
        artist: mvData.artistName,
        publishTime: mvData.publishTime,
        platform: 'netease',
        mvid,
        formats: [
          {
            name: '1080p',
            width: 1920,
            height: 1080,
            format: 'mp4'
          },
          {
            name: '720p',
            width: 1280,
            height: 720,
            format: 'mp4'
          },
          {
            name: '480p',
            width: 854,
            height: 480,
            format: 'mp4'
          }
        ],
        streams: {
          '1080p': urlData.url,
          '720p': urlData.url.replace('1080', '720'),
          '480p': urlData.url.replace('1080', '480')
        }
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

  // 获取MV评论
  async getComments(mvid, offset = 0, limit = 20) {
    try {
      const commentUrl = 'https://music.163.com/weapi/v1/resource/comments/R_MV_5_' + mvid;
      const params = this.generateNeteaseParams({
        offset,
        limit,
        csrf_token: ''
      });

      const response = await axios.post(commentUrl, new URLSearchParams(params), {
        headers: {
          ...this.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`获取评论失败: ${error.message}`);
    }
  }

  // 获取相关MV推荐
  async getRecommendations(mvid) {
    try {
      const recommendUrl = 'https://music.163.com/weapi/discovery/simiMV';
      const params = this.generateNeteaseParams({
        mvid,
        csrf_token: ''
      });

      const response = await axios.post(recommendUrl, new URLSearchParams(params), {
        headers: {
          ...this.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data.mvs || [];
    } catch (error) {
      throw new Error(`获取推荐视频失败: ${error.message}`);
    }
  }
}

module.exports = new NeteasePlatform();
