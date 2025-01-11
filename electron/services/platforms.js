const ytdl = require('ytdl-core');

const platforms = {
  youtube: {
    name: 'YouTube',
    match: (url) => {
      return ytdl.validateURL(url);
    },
    getInfo: async (url) => {
      try {
        const info = await ytdl.getInfo(url);
        return {
          title: info.videoDetails.title,
          duration: info.videoDetails.lengthSeconds,
          formats: info.formats.map(format => ({
            itag: format.itag,
            quality: format.qualityLabel || format.quality,
            container: format.container,
            hasAudio: format.hasAudio,
            hasVideo: format.hasVideo,
            contentLength: format.contentLength,
            url: format.url
          }))
        };
      } catch (error) {
        throw new Error(`获取视频信息失败: ${error.message}`);
      }
    },
    download: (url, options) => {
      return ytdl(url, options);
    }
  }
};

module.exports = platforms;
