const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const ffmpeg = require('fluent-ffmpeg');
const EventEmitter = require('events');
const history = require('./history');

class ConvertTask {
  constructor(inputPath, options = {}) {
    this.inputPath = inputPath;
    this.options = options;
    this.status = 'pending'; // pending, converting, completed, error
    this.progress = 0;
    this.outputPath = '';
    this.error = null;
    this.duration = 0;
    this.startTime = 0;
    this.endTime = 0;
    this.priority = options.priority || 0; // 新增：优先级，默认为0
    this.addedTime = Date.now(); // 新增：添加时间
  }
}

class Converter extends EventEmitter {
  constructor() {
    super();
    // 创建转换输出目录
    this.outputPath = path.join(app.getPath('downloads'), 'VideoToolbox', 'Converted');
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }

    // 转换队列
    this.queue = new Map();
    this.activeConversions = 0;
    this.maxConcurrentConversions = 2;

    // 支持的格式
    this.supportedFormats = {
      video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'],
      audio: ['mp3', 'aac', 'wav', 'ogg', 'm4a']
    };

    // 预设配置
    this.presets = {
      // 视频预设
      'h264-baseline': {
        videoCodec: 'libx264',
        videoBitrate: '1000k',
        audioCodec: 'aac',
        audioBitrate: '128k',
        profile: 'baseline',
        preset: 'medium'
      },
      'h264-main': {
        videoCodec: 'libx264',
        videoBitrate: '2000k',
        audioCodec: 'aac',
        audioBitrate: '192k',
        profile: 'main',
        preset: 'medium'
      },
      'h264-high': {
        videoCodec: 'libx264',
        videoBitrate: '4000k',
        audioCodec: 'aac',
        audioBitrate: '256k',
        profile: 'high',
        preset: 'medium'
      },
      'h265': {
        videoCodec: 'libx265',
        videoBitrate: '2000k',
        audioCodec: 'aac',
        audioBitrate: '192k',
        preset: 'medium'
      },
      // 音频预设
      'mp3-normal': {
        audioCodec: 'libmp3lame',
        audioBitrate: '128k'
      },
      'mp3-high': {
        audioCodec: 'libmp3lame',
        audioBitrate: '320k'
      },
      'aac-normal': {
        audioCodec: 'aac',
        audioBitrate: '128k'
      },
      'aac-high': {
        audioCodec: 'aac',
        audioBitrate: '256k'
      }
    };

    // 优先级配置
    this.priorityLevels = {
      HIGHEST: 100,
      HIGH: 75,
      NORMAL: 50,
      LOW: 25,
      LOWEST: 0
    };
  }

  generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async addToQueue(inputPath, options = {}) {
    // 验证输入文件
    if (!fs.existsSync(inputPath)) {
      throw new Error('输入文件不存在');
    }

    const taskId = this.generateTaskId();
    // 如果没有指定优先级，使用NORMAL
    if (options.priority === undefined) {
      options.priority = this.priorityLevels.NORMAL;
    }
    const task = new ConvertTask(inputPath, options);
    this.queue.set(taskId, task);

    try {
      // 获取输出路径
      const inputExt = path.extname(inputPath);
      const outputExt = options.format || inputExt;
      const baseName = path.basename(inputPath, inputExt);
      task.outputPath = path.join(
        this.outputPath,
        `${baseName}_converted${outputExt}`
      );

      // 获取视频信息
      await this.getMediaInfo(task);

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

  async getMediaInfo(task) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(task.inputPath, (err, metadata) => {
        if (err) {
          reject(new Error(`获取媒体信息失败: ${err.message}`));
          return;
        }

        task.duration = metadata.format.duration;
        task.metadata = metadata;
        resolve(metadata);
      });
    });
  }

  async processQueue() {
    if (this.activeConversions >= this.maxConcurrentConversions) {
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
      if (this.activeConversions < this.maxConcurrentConversions) {
        this.activeConversions++;
        this.startConversion(taskId, task);
      } else {
        break;
      }
    }
  }

  async startConversion(taskId, task) {
    task.status = 'converting';
    task.startTime = Date.now();
    this.emit('taskStarted', { taskId, task });

    try {
      await new Promise((resolve, reject) => {
        const command = ffmpeg(task.inputPath);

        // 设置输出格式和编码器
        const preset = this.presets[task.options.preset || 'h264-main'];
        command
          .format(task.options.format?.slice(1) || path.extname(task.outputPath).slice(1))
          .videoCodec(preset.videoCodec)
          .videoBitrate(preset.videoBitrate)
          .audioCodec(preset.audioCodec)
          .audioBitrate(preset.audioBitrate);

        // 设置分辨率
        if (task.options.width && task.options.height) {
          command.size(`${task.options.width}x${task.options.height}`);
        }

        // 设置帧率
        if (task.options.fps) {
          command.fps(task.options.fps);
        }

        // 监听进度
        command.on('progress', (progress) => {
          task.progress = progress.percent / 100;
          this.emit('taskProgress', {
            taskId,
            progress: task.progress,
            frame: progress.frames,
            fps: progress.currentFps,
            time: progress.timemark
          });
        });

        // 监听完成
        command.on('end', () => {
          task.status = 'completed';
          task.endTime = Date.now();
          this.activeConversions--;
          this.emit('taskCompleted', { taskId, task });

          // 添加到历史记录
          history.addConvertRecord({
            id: taskId,
            inputPath: task.inputPath,
            outputPath: task.outputPath,
            format: task.options.format,
            preset: task.options.preset,
            duration: task.duration,
            processTime: task.endTime - task.startTime,
            status: task.status,
            priority: task.priority
          });

          this.processQueue();
          resolve();
        });

        // 监听错误
        command.on('error', (err) => {
          task.status = 'error';
          task.error = err.message;
          task.endTime = Date.now();
          this.activeConversions--;

          // 添加到历史记录
          history.addConvertRecord({
            id: taskId,
            inputPath: task.inputPath,
            outputPath: task.outputPath,
            format: task.options.format,
            preset: task.options.preset,
            duration: task.duration,
            processTime: task.endTime - task.startTime,
            status: task.status,
            error: err.message,
            priority: task.priority
          });

          this.emit('taskError', { taskId, error: err.message });
          this.processQueue();
          reject(err);
        });

        // 开始转换
        command.save(task.outputPath);
      });
    } catch (error) {
      // 错误已在 Promise 中处理
    }
  }

  cancelTask(taskId) {
    const task = this.queue.get(taskId);
    if (task && task.status === 'converting') {
      this.emit(`cancel-${taskId}`);
    }
  }

  // 批量添加转换任务
  async addBatchToQueue(inputPaths, options = {}) {
    const taskIds = [];
    for (const inputPath of inputPaths) {
      try {
        const taskId = await this.addToQueue(inputPath, options);
        taskIds.push(taskId);
      } catch (error) {
        console.error(`添加任务失败: ${inputPath}`, error);
      }
    }
    return taskIds;
  }

  // 获取任务状态
  getTaskStatus(taskId) {
    return this.queue.get(taskId);
  }

  // 获取所有任务状态
  getAllTasks() {
    return Array.from(this.queue.entries()).map(([taskId, task]) => ({
      taskId,
      ...task
    }));
  }

  // 获取支持的格式
  getSupportedFormats() {
    return this.supportedFormats;
  }

  // 获取可用预设
  getPresets() {
    return this.presets;
  }

  // 设置最大并发转换数
  setMaxConcurrentConversions(count) {
    this.maxConcurrentConversions = count;
    this.processQueue();
  }

  // 清理所有已完成的任务
  clearCompletedTasks() {
    for (const [taskId, task] of this.queue.entries()) {
      if (task.status === 'completed') {
        this.queue.delete(taskId);
      }
    }
  }

  // 设置任务优先级
  setPriority(taskId, priority) {
    const task = this.queue.get(taskId);
    if (task) {
      const oldPriority = task.priority;
      task.priority = priority;
      this.emit('taskPriorityChanged', { 
        taskId, 
        oldPriority, 
        newPriority: priority 
      });
      
      // 如果任务正在转换，且存在更高优先级的待处理任务，则取消当前任务
      if (task.status === 'converting') {
        const hasPendingHigherPriority = Array.from(this.queue.values()).some(t => 
          t.status === 'pending' && t.priority > priority
        );
        
        if (hasPendingHigherPriority) {
          this.cancelTask(taskId);
          task.status = 'pending';
          this.processQueue();
        }
      } else if (task.status === 'pending') {
        this.processQueue();
      }
    }
  }

  // 批量设置优先级
  setBatchPriority(taskIds, priority) {
    for (const taskId of taskIds) {
      this.setPriority(taskId, priority);
    }
  }

  // 获取预定义的优先级级别
  getPriorityLevels() {
    return this.priorityLevels;
  }

  // 按优先级获取任务
  getTasksByPriority(priority) {
    return Array.from(this.queue.entries())
      .filter(([_, task]) => task.priority === priority)
      .map(([taskId, task]) => ({ taskId, ...task }));
  }

  // 获取任务的优先级
  getTaskPriority(taskId) {
    const task = this.queue.get(taskId);
    return task ? task.priority : null;
  }

  // 提升任务优先级
  increasePriority(taskId) {
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
    const stats = {
      total: this.queue.size,
      active: 0,
      pending: 0,
      completed: 0,
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
        case 'converting':
          stats.active++;
          break;
        case 'pending':
          stats.pending++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'error':
          stats.error++;
          break;
      }
    }

    return stats;
  }
}

module.exports = new Converter();
