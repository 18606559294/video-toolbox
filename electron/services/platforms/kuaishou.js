const BasePlatform = require('./base');
const axios = require('axios');
const { parse } = require('url');

class KuaishouPlatform extends BasePlatform {
  constructor() {
    super();
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Cookie': '', // 某些视频可能需要登录
      'Referer': 'https://www.kuaishou.com/'
    };
  }

  isMatch(url) {
    return url.includes('kuaishou.com');
  }

  async getPhotoId(url) {
    // 支持多种URL格式：
    // https://www.kuaishou.com/short-video/{photoId}
    // https://v.kuaishou.com/{shortCode}
    if (url.includes('short-video')) {
      const matches = url.match(/short-video\/([^?/]+)/);
      if (matches) {
        return matches[1];
      }
    }

    // 处理短链接
    const response = await axios.get(url, {
      headers: this.headers,
      maxRedirects: 5
    });
    const redirectUrl = response.request.res.responseUrl;
    const matches = redirectUrl.match(/short-video\/([^?/]+)/);
    if (!matches) {
      throw new Error('无效的快手视频链接');
    }
    return matches[1];
  }

  async getVideoInfo(url) {
    try {
      const photoId = await this.getPhotoId(url);
      const apiUrl = 'https://www.kuaishou.com/graphql';
      
      const response = await axios.post(apiUrl, {
        operationName: "visionVideoDetail",
        variables: {
          photoId: photoId,
          page: "detail"
        },
        query: `
          query visionVideoDetail($photoId: String, $type: String, $page: String) {
            visionVideoDetail(photoId: $photoId, type: $type, page: $page) {
              photo {
                id
                duration
                caption
                originCaption
                likeCount
                viewCount
                realLikeCount
                coverUrl
                photoUrl
                photoH265Url
                manifest
                manifestH265
                videoResource
                coverUrls {
                  url
                }
                timestamp
                height
                width
                user {
                  id
                  name
                  headerUrl
                  following
                  headerUrls {
                    url
                  }
                }
                expTag
                animatedCoverUrl
                distance
                videoRatio
                liked
                stereoType
                profileUserTopPhoto
                musicName
              }
            }
          }
        `
      }, {
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        }
      });

      const videoData = response.data.data.visionVideoDetail.photo;
      if (!videoData) {
        throw new Error('未找到视频信息');
      }

      return {
        title: videoData.caption || '快手视频',
        author: videoData.user.name,
        duration: videoData.duration,
        coverUrl: videoData.coverUrl,
        description: videoData.originCaption,
        videoUrl: videoData.photoUrl || videoData.photoH265Url,
        platform: 'kuaishou',
        quality: {
          width: videoData.width,
          height: videoData.height
        },
        stats: {
          likes: videoData.likeCount,
          views: videoData.viewCount
        }
      };
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  async download(url, options = {}) {
    try {
      const info = await this.getVideoInfo(url);
      const videoUrl = info.videoUrl;

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
          size: parseInt(response.headers['content-length'] || 0)
        }
      };
    } catch (error) {
      throw new Error(`下载失败: ${error.message}`);
    }
  }
}

module.exports = new KuaishouPlatform();
