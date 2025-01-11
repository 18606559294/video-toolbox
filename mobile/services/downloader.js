import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

class Downloader {
  constructor() {
    this.downloadPath = Platform.select({
      android: `${RNFS.ExternalDirectoryPath}/VideoToolbox`,
      ios: `${RNFS.DocumentDirectoryPath}/VideoToolbox`
    });

    // 确保下载目录存在
    RNFS.mkdir(this.downloadPath);
  }

  async downloadVideo(url, onProgress) {
    try {
      // 从URL中提取文件名
      const fileName = url.split('/').pop() || 'video.mp4';
      const filePath = `${this.downloadPath}/${fileName}`;

      const options = {
        fromUrl: url,
        toFile: filePath,
        progress: (response) => {
          const progress = response.bytesWritten / response.contentLength;
          onProgress && onProgress(progress);
        },
        background: true,
        begin: (response) => {
          console.log('下载开始', response);
        }
      };

      const response = await RNFS.downloadFile(options).promise;
      
      if (response.statusCode === 200) {
        return {
          path: filePath,
          size: response.bytesWritten
        };
      } else {
        throw new Error(`下载失败: HTTP ${response.statusCode}`);
      }
    } catch (error) {
      throw new Error(`下载失败: ${error.message}`);
    }
  }

  // 获取视频信息的方法将在后续实现
  async getVideoInfo(url) {
    // TODO: 实现获取视频信息的逻辑
    return {
      title: '视频',
      duration: 0,
      size: 0
    };
  }
}

export default new Downloader();
