class BasePlatform {
  constructor(name) {
    this.name = name;
    this.requiresAuth = false; // 是否需要登录
    this.supportedQualities = []; // 支持的视频质量
    this.supportedFormats = []; // 支持的视频格式
  }

  // 创建下载器实例
  createDownloader(task) {
    throw new Error('需要实现 createDownloader 方法');
  }

  // 获取视频信息
  async getVideoInfo(url) {
    throw new Error('需要实现 getVideoInfo 方法');
  }

  // 验证URL
  validateUrl(url) {
    throw new Error('需要实现 validateUrl 方法');
  }

  // 检查是否支持该URL
  isSupported(url) {
    try {
      return this.validateUrl(url);
    } catch (error) {
      return false;
    }
  }

  // 获取支持的视频质量
  getSupportedQualities() {
    return this.supportedQualities;
  }

  // 获取支持的视频格式
  getSupportedFormats() {
    return this.supportedFormats;
  }

  // 检查是否需要登录
  requiresAuthentication() {
    return this.requiresAuth;
  }

  // 获取平台名称
  getPlatformName() {
    return this.name;
  }

  // 获取平台图标
  getPlatformIcon() {
    return `assets/icons/${this.name.toLowerCase()}.png`;
  }

  // 获取平台主页
  getPlatformHomepage() {
    throw new Error('需要实现 getPlatformHomepage 方法');
  }

  // 获取平台限制
  getPlatformLimits() {
    return {
      maxConcurrentDownloads: 3,
      maxFileSize: null,
      maxDuration: null,
      requiresSubscription: false
    };
  }

  // 检查URL是否需要登录
  async checkUrlRequiresAuth(url) {
    return this.requiresAuth;
  }

  // 检查URL是否可用
  async checkUrlAvailability(url) {
    throw new Error('需要实现 checkUrlAvailability 方法');
  }

  // 解析播放列表
  async parsePlaylist(url) {
    throw new Error('需要实现 parsePlaylist 方法');
  }

  // 检查是否为播放列表
  isPlaylist(url) {
    throw new Error('需要实现 isPlaylist 方法');
  }

  // 获取推荐视频
  async getRecommendedVideos(url) {
    throw new Error('需要实现 getRecommendedVideos 方法');
  }

  // 获取作者信息
  async getAuthorInfo(url) {
    throw new Error('需要实现 getAuthorInfo 方法');
  }

  // 获取评论
  async getComments(url) {
    throw new Error('需要实现 getComments 方法');
  }

  // 获取字幕
  async getSubtitles(url) {
    throw new Error('需要实现 getSubtitles 方法');
  }

  // 获取视频章节
  async getChapters(url) {
    throw new Error('需要实现 getChapters 方法');
  }

  // 获取直播状态
  async getLiveStatus(url) {
    throw new Error('需要实现 getLiveStatus 方法');
  }

  // 检查是否为直播
  isLiveStream(url) {
    throw new Error('需要实现 isLiveStream 方法');
  }

  // 获取平台API限制
  getApiLimits() {
    return {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      requestsPerDay: 10000
    };
  }
}

module.exports = BasePlatform;
