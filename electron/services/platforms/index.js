const youtube = require('ytdl-core');
const douyin = require('./douyin');
const bilibili = require('./bilibili');
const xigua = require('./xigua');
const kuaishou = require('./kuaishou');
const tencent = require('./tencent');
const youku = require('./youku');
const iqiyi = require('./iqiyi');
const mgtv = require('./mgtv');
const sohu = require('./sohu');
const pptv = require('./pptv');
const acfun = require('./acfun');
const migu = require('./migu');
const netease = require('./netease');
const weibo = require('./weibo');
const cctv = require('./cctv');
const zhihu = require('./zhihu');
const huoshan = require('./huoshan');
const xiaohongshu = require('./xiaohongshu');
const tiktok = require('./tiktok');
const instagram = require('./instagram');
const twitter = require('./twitter');
const linkedin = require('./linkedin');
const pinterest = require('./pinterest');
const vimeo = require('./vimeo');
const dailymotion = require('./dailymotion');

class PlatformManager {
  constructor() {
    this.platforms = [
      {
        name: 'YouTube',
        matcher: (url) => youtube.validateURL(url),
        handler: {
          getVideoInfo: async (url) => {
            const info = await youtube.getInfo(url);
            return {
              title: info.videoDetails.title,
              author: info.videoDetails.author.name,
              duration: parseInt(info.videoDetails.lengthSeconds),
              formats: info.formats,
              platform: 'youtube'
            };
          },
          download: youtube.downloadFromInfo
        }
      },
      {
        name: '抖音',
        matcher: douyin.isMatch.bind(douyin),
        handler: douyin
      },
      {
        name: '哔哩哔哩',
        matcher: bilibili.isMatch.bind(bilibili),
        handler: bilibili
      },
      {
        name: '西瓜视频',
        matcher: xigua.isMatch.bind(xigua),
        handler: xigua
      },
      {
        name: '快手',
        matcher: kuaishou.isMatch.bind(kuaishou),
        handler: kuaishou
      },
      {
        name: '腾讯视频',
        matcher: tencent.isMatch.bind(tencent),
        handler: tencent
      },
      {
        name: '优酷',
        matcher: youku.isMatch.bind(youku),
        handler: youku
      },
      {
        name: '爱奇艺',
        matcher: iqiyi.isMatch.bind(iqiyi),
        handler: iqiyi
      },
      {
        name: '芒果TV',
        matcher: mgtv.isMatch.bind(mgtv),
        handler: mgtv
      },
      {
        name: '搜狐视频',
        matcher: sohu.isMatch.bind(sohu),
        handler: sohu
      },
      {
        name: 'PP视频',
        matcher: pptv.isMatch.bind(pptv),
        handler: pptv
      },
      {
        name: 'AcFun',
        matcher: acfun.isMatch.bind(acfun),
        handler: acfun
      },
      {
        name: '咪咕视频',
        matcher: migu.isMatch.bind(migu),
        handler: migu
      },
      {
        name: '网易云音乐',
        matcher: netease.isMatch.bind(netease),
        handler: netease
      },
      {
        name: '微博',
        matcher: weibo.isMatch.bind(weibo),
        handler: weibo
      },
      {
        name: '央视网',
        matcher: cctv.isMatch.bind(cctv),
        handler: cctv
      },
      {
        name: '知乎',
        matcher: zhihu.isMatch.bind(zhihu),
        handler: zhihu
      },
      {
        name: '抖音火山版',
        matcher: huoshan.isMatch.bind(huoshan),
        handler: huoshan
      },
      {
        name: '小红书',
        matcher: xiaohongshu.isMatch.bind(xiaohongshu),
        handler: xiaohongshu
      },
      {
        name: 'TikTok',
        matcher: tiktok.isMatch.bind(tiktok),
        handler: tiktok
      },
      {
        name: 'Instagram',
        matcher: instagram.isMatch.bind(instagram),
        handler: instagram
      },
      {
        name: 'Twitter',
        matcher: twitter.isMatch.bind(twitter),
        handler: twitter
      },
      {
        name: 'LinkedIn',
        matcher: linkedin.isMatch.bind(linkedin),
        handler: linkedin
      },
      {
        name: 'Pinterest',
        matcher: pinterest.isMatch.bind(pinterest),
        handler: pinterest
      },
      {
        name: 'Vimeo',
        matcher: vimeo.isMatch.bind(vimeo),
        handler: vimeo
      },
      {
        name: 'Dailymotion',
        matcher: dailymotion.isMatch.bind(dailymotion),
        handler: dailymotion
      }
    ];
  }

  getPlatform(url) {
    const platform = this.platforms.find(p => p.matcher(url));
    if (!platform) {
      throw new Error('不支持的视频平台');
    }
    return platform;
  }

  async getVideoInfo(url) {
    const platform = this.getPlatform(url);
    const info = await platform.handler.getVideoInfo(url);
    return {
      ...info,
      platformName: platform.name
    };
  }

  async download(url, options = {}) {
    const platform = this.getPlatform(url);
    return platform.handler.download(url, options);
  }

  getSupportedPlatforms() {
    return this.platforms.map(p => p.name);
  }

  // 获取平台特定的配置选项
  getPlatformOptions(platformName) {
    const platform = this.platforms.find(p => p.name === platformName);
    if (!platform) {
      return null;
    }

    switch (platformName) {
      case 'YouTube':
        return {
          qualities: ['highest', '1080p', '720p', '480p', '360p', 'lowest'],
          formats: ['mp4', 'webm']
        };
      case '哔哩哔哩':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4', 'flv']
        };
      case '腾讯视频':
        return {
          qualities: ['shd', 'hd', 'sd'],
          formats: ['mp4']
        };
      case '优酷':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4', 'm3u8']
        };
      case '爱奇艺':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4', 'm3u8']
        };
      case '芒果TV':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4', 'm3u8']
        };
      case '搜狐视频':
        return {
          qualities: ['超清', '高清', '标清'],
          formats: ['mp4', 'm3u8']
        };
      case 'PP视频':
        return {
          qualities: ['1080p', '720p', '480p'],
          formats: ['mp4']
        };
      case 'AcFun':
        return {
          qualities: ['1080p60', '1080p', '720p60', '720p', '540p', '360p'],
          formats: ['mp4', 'flv']
        };
      case '咪咕视频':
        return {
          qualities: ['超清', '高清', '标清'],
          formats: ['mp4', 'm3u8']
        };
      case '网易云音乐':
        return {
          qualities: ['1080p', '720p', '480p'],
          formats: ['mp4']
        };
      case '微博':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4']
        };
      case '央视网':
        return {
          qualities: ['1080p', '720p', '480p'],
          formats: ['mp4', 'm3u8']
        };
      case '知乎':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4']
        };
      case '抖音火山版':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4']
        };
      case '小红书':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4']
        };
      case 'TikTok':
        return {
          qualities: ['1080p', '720p', '480p'],
          formats: ['mp4'],
          requiresProxy: true
        };
      case 'Instagram':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4'],
          requiresProxy: true
        };
      case 'Twitter':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4'],
          requiresProxy: true,
          requiresAuth: true
        };
      case 'LinkedIn':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4']
        };
      case 'Pinterest':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4']
        };
      case 'Vimeo':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4']
        };
      case 'Dailymotion':
        return {
          qualities: ['1080p', '720p', '480p', '360p'],
          formats: ['mp4']
        };
      default:
        return {
          qualities: ['highest', 'lowest'],
          formats: ['mp4']
        };
    }
  }

  // 检查是否需要登录
  requiresLogin(platformName) {
    return ['腾讯视频', '优酷', '爱奇艺', '芒果TV', '搜狐视频', 'PP视频', 'AcFun', '咪咕视频', '网易云音乐', '微博', '央视网', '知乎', '抖音火山版', '小红书', 'TikTok', 'Instagram', 'Twitter'].includes(platformName);
  }

  // 检查是否需要代理
  requiresProxy(platformName) {
    return ['TikTok', 'Instagram', 'Twitter'].includes(platformName);
  }

  // 检查是否需要会员
  async checkVipRequired(url) {
    const platform = this.getPlatform(url);
    if (platform.handler.checkVipRequired) {
      return platform.handler.checkVipRequired(url);
    }
    return false;
  }

  // 获取平台特定功能
  getPlatformFeatures(platformName) {
    switch (platformName) {
      case 'AcFun':
        return {
          hasDanmaku: true,
          hasComments: true
        };
      case '咪咕视频':
        return {
          hasRecommendations: true,
          hasLiveStreams: true
        };
      case '网易云音乐':
        return {
          hasComments: true,
          hasRecommendations: true,
          hasMusicInfo: true
        };
      case '微博':
        return {
          hasComments: true,
          hasRecommendations: true,
          hasUserVideos: true
        };
      case '央视网':
        return {
          hasLiveStreams: true,
          hasProgramSchedule: true,
          hasChannelInfo: true
        };
      case '知乎':
        return {
          hasComments: true,
          hasRecommendations: true,
          hasAuthorVideos: true,
          hasTopics: true
        };
      case '抖音火山版':
        return {
          hasComments: true,
          hasRecommendations: true,
          hasUserInfo: true,
          hasUserVideos: true,
          hasMusicInfo: true
        };
      case '小红书':
        return {
          hasComments: true,
          hasRecommendations: true,
          hasUserNotes: true,
          hasCollections: true,
          hasLocation: true,
          hasTags: true,
          hasTopics: true
        };
      case 'TikTok':
        return {
          hasComments: true,
          hasUserInfo: true,
          hasUserVideos: true,
          hasMusicInfo: true,
          hasHashtags: true,
          hasStatistics: true
        };
      case 'Instagram':
        return {
          hasComments: true,
          hasUserInfo: true,
          hasUserMedia: true,
          hasTagMedia: true,
          hasLocationMedia: true,
          hasCarousel: true,
          hasMentions: true,
          hasHashtags: true,
          hasStatistics: true
        };
      case 'Twitter':
        return {
          hasComments: true,
          hasUserInfo: true,
          hasUserTimeline: true,
          hasHashtagTweets: true,
          hasRetweets: true,
          hasLikes: true,
          hasMentions: true,
          hasHashtags: true,
          hasStatistics: true,
          hasQuoteTweets: true
        };
      default:
        return {
          hasDanmaku: false,
          hasComments: false,
          hasRecommendations: false,
          hasLiveStreams: false,
          hasMusicInfo: false,
          hasUserVideos: false,
          hasProgramSchedule: false,
          hasChannelInfo: false,
          hasTopics: false,
          hasUserInfo: false,
          hasUserNotes: false,
          hasCollections: false,
          hasLocation: false,
          hasTags: false,
          hasHashtags: false,
          hasStatistics: false,
          hasCarousel: false,
          hasMentions: false,
          hasUserMedia: false,
          hasTagMedia: false,
          hasLocationMedia: false,
          hasUserTimeline: false,
          hasHashtagTweets: false,
          hasRetweets: false,
          hasLikes: false,
          hasQuoteTweets: false
        };
    }
  }

  // 获取平台额外功能
  async getExtraFeatures(url) {
    const platform = this.getPlatform(url);
    const features = {};

    if (platform.handler.getComments) {
      features.getComments = platform.handler.getComments.bind(platform.handler);
    }
    if (platform.handler.getRecommendations) {
      features.getRecommendations = platform.handler.getRecommendations.bind(platform.handler);
    }
    if (platform.handler.getDanmaku) {
      features.getDanmaku = platform.handler.getDanmaku.bind(platform.handler);
    }
    if (platform.handler.getUserVideos) {
      features.getUserVideos = platform.handler.getUserVideos.bind(platform.handler);
    }
    if (platform.handler.getProgramSchedule) {
      features.getProgramSchedule = platform.handler.getProgramSchedule.bind(platform.handler);
    }
    if (platform.handler.getLiveStream) {
      features.getLiveStream = platform.handler.getLiveStream.bind(platform.handler);
    }
    if (platform.handler.getAuthorVideos) {
      features.getAuthorVideos = platform.handler.getAuthorVideos.bind(platform.handler);
    }
    if (platform.handler.getUserInfo) {
      features.getUserInfo = platform.handler.getUserInfo.bind(platform.handler);
    }
    if (platform.handler.getUserNotes) {
      features.getUserNotes = platform.handler.getUserNotes.bind(platform.handler);
    }
    if (platform.handler.getUserCollections) {
      features.getUserCollections = platform.handler.getUserCollections.bind(platform.handler);
    }
    if (platform.handler.getMusicVideos) {
      features.getMusicVideos = platform.handler.getMusicVideos.bind(platform.handler);
    }
    if (platform.handler.getHashtagVideos) {
      features.getHashtagVideos = platform.handler.getHashtagVideos.bind(platform.handler);
    }
    if (platform.handler.getUserMedia) {
      features.getUserMedia = platform.handler.getUserMedia.bind(platform.handler);
    }
    if (platform.handler.getTagMedia) {
      features.getTagMedia = platform.handler.getTagMedia.bind(platform.handler);
    }
    if (platform.handler.getLocationMedia) {
      features.getLocationMedia = platform.handler.getLocationMedia.bind(platform.handler);
    }
    if (platform.handler.getUserTimeline) {
      features.getUserTimeline = platform.handler.getUserTimeline.bind(platform.handler);
    }
    if (platform.handler.getHashtagTweets) {
      features.getHashtagTweets = platform.handler.getHashtagTweets.bind(platform.handler);
    }
    if (platform.handler.getRetweets) {
      features.getRetweets = platform.handler.getRetweets.bind(platform.handler);
    }
    if (platform.handler.getLikes) {
      features.getLikes = platform.handler.getLikes.bind(platform.handler);
    }

    return features;
  }

  // 设置代理
  setProxy(platformName, proxyUrl) {
    const platform = this.platforms.find(p => p.name === platformName);
    if (platform && platform.handler.setProxy) {
      platform.handler.setProxy(proxyUrl);
    }
  }
}

module.exports = new PlatformManager();
