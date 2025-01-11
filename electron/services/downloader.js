const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const platforms = require('./platforms');
const EventEmitter = require('events');
const History = require('./history');
const Auth = require('./auth');

class DownloadTask {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.status = 'pending'; // pending, downloading, paused, completed, error
    this.progress = 0;
    this.downloaded = 0;
    this.total = 0;
    this.speed = 0;
    this.error = null;
    this.resumePosition = 0;
    this.outputPath = '';
    this.info = null;
    this.priority = options.priority || 0;
    this.addedTime = Date.now();
  }
}

class Downloader extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.initPromise = null;
    this.initOnReady();
  }

  initOnReady() {
    this.initPromise = new Promise((resolve) => {
      if (app.isReady()) {
        resolve(this.init());
      } else {
        app.on('ready', () => {
          resolve(this.init());
        });
      }
    });
  }

  async waitForInit() {
    await this.initPromise;
    return this;
  }

  async init() {
    if (this.initialized) return;

    try {
      // 创建下载目录
      this.downloadPath = path.join(app.getPath('downloads'), 'VideoToolbox');
      if (!fs.existsSync(this.downloadPath)) {
        fs.mkdirSync(this.downloadPath, { recursive: true });
      }

      // 初始化服务
      this.history = new History();
      await this.history.waitForInit();
      
      this.auth = new Auth();
      await this.auth.waitForInit();

      // 下载队列
      this.queue = new Map();
      this.activeDownloads = 0;
      this.maxConcurrentDownloads = 3;
      
      // 下载配置
      this.chunkSize = 1024 * 1024; // 1MB
      this.retryAttempts = 3;
      this.retryDelay = 1000; // 1秒

      // 优先级配置
      this.priorityLevels = {
        HIGHEST: 100,
        HIGH: 75,
        NORMAL: 50,
        LOW: 25,
        LOWEST: 0
      };

      this.initialized = true;
    } catch (error) {
      console.error('Downloader initialization failed:', error);
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.waitForInit();
    }
  }

  async getVideoInfo(url) {
    try {
      return await platforms.getVideoInfo(url);
    } catch (error) {
      throw new Error(`获取视频信息失败: ${error.message}`);
    }
  }

  generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async addToQueue(url, options = {}) {
    await this.ensureInitialized();
    const taskId = this.generateTaskId();
    // 如果没有指定优先级，使用NORMAL
    if (options.priority === undefined) {
      options.priority = this.priorityLevels.NORMAL;
    }
    const task = new DownloadTask(url, options);
    this.queue.set(taskId, task);
    
    try {
      // 获取平台信息
      const platform = platforms.getPlatform(url);
      const platformName = platform.name;

      // 检查是否需要登录
      if (platform.requiresAuth && !this.auth.isLoggedIn(platformName)) {
        // 尝试自动登录
        const loginSuccess = await this.auth.login(platformName);
        if (!loginSuccess) {
          throw new Error(`需要登录 ${platformName}`);
        }
      }

      // 获取视频信息
      task.info = await this.getVideoInfo(url);
      const fileName = `${task.info.title.replace(/[\\/:*?"<>|]/g, '_')}_${task.info.platformName}.mp4`;
      task.outputPath = path.join(this.downloadPath, fileName);
      
      // 检查是否存在未完成的下载
      if (fs.existsSync(task.outputPath + '.download')) {
        const stats = fs.statSync(task.outputPath + '.download');
        task.resumePosition = stats.size;
      }
      
      this.emit('taskAdded', { taskId, task });
      this.processQueue();
      return taskId;
    } catch (error) {
      task.status = 'error';
      task.error = error.message;
      this.emit('taskError', { taskId, error: error.message });
      throw error;
    }
  }

  async processQueue() {
    await this.ensureInitialized();
    if (this.activeDownloads >= this.maxConcurrentDownloads) {
      return;
    }

    // 获取所有待处理的任务
    const pendingTasks = Array.from(this.queue.entries())
      .filter(([_, task]) => task.status === 'pending')
      .sort((a, b) => {
        // 首先按优先级排序（高到低）
        const priorityDiff = b[1].priority - a[1].priority;
        if (priorityDiff !== 0) return priorityDiff;
        // 优先级相同时，按添加时间排序（早到晚）
        return a[1].addedTime - b[1].addedTime;
      });

    // 启动高优先级任务
    for (const [taskId, task] of pendingTasks) {
      if (this.activeDownloads < this.maxConcurrentDownloads) {
        this.activeDownloads++;
        this.startDownload(taskId, task);
      } else {
        break;
      }
    }
  }

  async startDownload(taskId, task) {
    await this.ensureInitialized();
    task.status = 'downloading';
    task.startTime = Date.now();
    this.emit('taskStarted', { taskId, task });

    try {
      // 获取平台信息
      const platform = platforms.getPlatform(task.url);
      const platformName = platform.name;

      // 检查是否需要登录
      if (platform.requiresAuth && !this.auth.isLoggedIn(platformName)) {
        await this.auth.login(platformName);
      }

      const downloader = platform.createDownloader(task);

      // 监听下载进度
      downloader.on('progress', (progress) => {
        task.progress = progress.percent;
        task.speed = progress.speed;
        task.downloaded = progress.transferred;
        task.total = progress.total;
        this.emit('taskProgress', { taskId, progress });
      });

      // 开始下载
      await downloader.download();

      // 下载完成
      task.status = 'completed';
      task.endTime = Date.now();
      this.activeDownloads--;
      this.emit('taskCompleted', { taskId, task });

      // 添加到历史记录
      this.history.addDownloadRecord({
        id: taskId,
        url: task.url,
        title: task.info.title,
        platform: task.info.platformName,
        outputPath: task.outputPath,
        size: task.total,
        duration: task.endTime - task.startTime,
        status: task.status,
        priority: task.priority
      });

      this.processQueue();
    } catch (error) {
      task.status = 'error';
      task.error = error.message;
      task.endTime = Date.now();
      this.activeDownloads--;
      this.emit('taskError', { taskId, error: error.message });

      // 添加到历史记录
      this.history.addDownloadRecord({
        id: taskId,
        url: task.url,
        title: task.info?.title,
        platform: task.info?.platformName,
        outputPath: task.outputPath,
        size: task.total,
        duration: task.endTime - task.startTime,
        status: task.status,
        error: error.message,
        priority: task.priority
      });

      this.processQueue();
    }
  }

  pauseTask(taskId) {
    this.ensureInitialized();
    const task = this.queue.get(taskId);
    if (task && task.status === 'downloading') {
      this.emit(`pause-${taskId}`);
    }
  }

  resumeTask(taskId) {
    this.ensureInitialized();
    const task = this.queue.get(taskId);
    if (task && task.status === 'paused') {
      task.status = 'pending';
      this.processQueue();
    }
  }

  cancelTask(taskId) {
    this.ensureInitialized();
    const task = this.queue.get(taskId);
    if (task) {
      if (task.status === 'downloading') {
        this.emit(`pause-${taskId}`);
      }
      if (fs.existsSync(task.outputPath + '.download')) {
        fs.unlinkSync(task.outputPath + '.download');
      }
      this.queue.delete(taskId);
      this.emit('taskCancelled', { taskId, task });
    }
  }

  // 批量添加下载任务
  async addBatchToQueue(urls, options = {}) {
    await this.ensureInitialized();
    const taskIds = [];
    for (const url of urls) {
      try {
        const taskId = await this.addToQueue(url, options);
        taskIds.push(taskId);
      } catch (error) {
        console.error(`添加任务失败: ${url}`, error);
      }
    }
    return taskIds;
  }

  // 获取任务状态
  getTaskStatus(taskId) {
    this.ensureInitialized();
    return this.queue.get(taskId);
  }

  // 获取所有任务状态
  getAllTasks() {
    this.ensureInitialized();
    return Array.from(this.queue.entries()).map(([taskId, task]) => ({
      taskId,
      ...task
    }));
  }

  // 设置最大并发下载数
  setMaxConcurrentDownloads(count) {
    this.ensureInitialized();
    this.maxConcurrentDownloads = count;
    this.processQueue();
  }

  // 清理所有已完成的任务
  clearCompletedTasks() {
    this.ensureInitialized();
    for (const [taskId, task] of this.queue.entries()) {
      if (task.status === 'completed') {
        this.queue.delete(taskId);
      }
    }
  }

  getSupportedPlatforms() {
    return platforms.getSupportedPlatforms();
  }

  // 设置任务优先级
  setPriority(taskId, priority) {
    this.ensureInitialized();
    const task = this.queue.get(taskId);
    if (task) {
      const oldPriority = task.priority;
      task.priority = priority;
      this.emit('taskPriorityChanged', { 
        taskId, 
        oldPriority, 
        newPriority: priority 
      });
      
      // 如果任务正在下载，且存在更高优先级的待处理任务，则暂停当前任务
      if (task.status === 'downloading') {
        const hasPendingHigherPriority = Array.from(this.queue.values()).some(t => 
          t.status === 'pending' && t.priority > priority
        );
        
        if (hasPendingHigherPriority) {
          this.pauseTask(taskId);
          this.processQueue();
        }
      } else if (task.status === 'pending') {
        this.processQueue();
      }
    }
  }

  // 批量设置优先级
  setBatchPriority(taskIds, priority) {
    this.ensureInitialized();
    for (const taskId of taskIds) {
      this.setPriority(taskId, priority);
    }
  }

  // 获取预定义的优先级级别
  getPriorityLevels() {
    this.ensureInitialized();
    return this.priorityLevels;
  }

  // 按优先级获取任务
  getTasksByPriority(priority) {
    this.ensureInitialized();
    return Array.from(this.queue.entries())
      .filter(([_, task]) => task.priority === priority)
      .map(([taskId, task]) => ({ taskId, ...task }));
  }

  // 获取任务的优先级
  getTaskPriority(taskId) {
    this.ensureInitialized();
    const task = this.queue.get(taskId);
    return task ? task.priority : null;
  }

  // 提升任务优先级
  increasePriority(taskId) {
    this.ensureInitialized();
    const task = this.queue.get(taskId);
    if (task) {
      const currentPriority = task.priority;
      const priorities = Object.values(this.priorityLevels).sort((a, b) => a - b);
      const currentIndex = priorities.indexOf(currentPriority);
      
      if (currentIndex < priorities.length - 1) {
        this.setPriority(taskId, priorities[currentIndex + 1]);
      }
    }
  }

  // 降低任务优先级
  decreasePriority(taskId) {
    this.ensureInitialized();
    const task = this.queue.get(taskId);
    if (task) {
      const currentPriority = task.priority;
      const priorities = Object.values(this.priorityLevels).sort((a, b) => a - b);
      const currentIndex = priorities.indexOf(currentPriority);
      
      if (currentIndex > 0) {
        this.setPriority(taskId, priorities[currentIndex - 1]);
      }
    }
  }

  // 获取队列统计信息
  getQueueStats() {
    this.ensureInitialized();
    const stats = {
      total: this.queue.size,
      active: 0,
      pending: 0,
      completed: 0,
      paused: 0,
      error: 0,
      byPriority: {}
    };

    // 初始化优先级统计
    Object.values(this.priorityLevels).forEach(priority => {
      stats.byPriority[priority] = 0;
    });

    // 统计各状态的任务数量
    for (const task of this.queue.values()) {
      stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
      
      switch (task.status) {
        case 'downloading':
          stats.active++;
          break;
        case 'pending':
          stats.pending++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'paused':
          stats.paused++;
          break;
        case 'error':
          stats.error++;
          break;
      }
    }

    return stats;
  }
}

// 导出 Downloader 类而不是实例
module.exports = Downloader;
