const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class History extends EventEmitter {
  constructor() {
    super();
    // 创建历史记录目录
    this.historyPath = path.join(app.getPath('userData'), 'history');
    if (!fs.existsSync(this.historyPath)) {
      fs.mkdirSync(this.historyPath, { recursive: true });
    }

    // 历史记录文件路径
    this.downloadHistoryFile = path.join(this.historyPath, 'downloads.json');
    this.convertHistoryFile = path.join(this.historyPath, 'conversions.json');

    // 初始化历史记录
    this.downloadHistory = this.loadHistory(this.downloadHistoryFile);
    this.convertHistory = this.loadHistory(this.convertHistoryFile);

    // 自动保存间隔（5分钟）
    this.autoSaveInterval = 5 * 60 * 1000;
    this.setupAutoSave();

    // 最大历史记录数量
    this.maxHistoryItems = 1000;
  }

  // 加载历史记录
  loadHistory(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
    return [];
  }

  // 保存历史记录
  saveHistory(filePath, history) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf8');
      this.emit('historySaved', { type: path.basename(filePath, '.json') });
    } catch (error) {
      console.error('保存历史记录失败:', error);
      this.emit('historyError', { error: error.message });
    }
  }

  // 设置自动保存
  setupAutoSave() {
    setInterval(() => {
      this.saveHistory(this.downloadHistoryFile, this.downloadHistory);
      this.saveHistory(this.convertHistoryFile, this.convertHistory);
    }, this.autoSaveInterval);
  }

  // 添加下载记录
  addDownloadRecord(record) {
    const downloadRecord = {
      ...record,
      timestamp: Date.now(),
      type: 'download'
    };

    this.downloadHistory.unshift(downloadRecord);
    this.trimHistory(this.downloadHistory);
    this.saveHistory(this.downloadHistoryFile, this.downloadHistory);
    this.emit('downloadRecordAdded', downloadRecord);
  }

  // 添加转换记录
  addConvertRecord(record) {
    const convertRecord = {
      ...record,
      timestamp: Date.now(),
      type: 'convert'
    };

    this.convertHistory.unshift(convertRecord);
    this.trimHistory(this.convertHistory);
    this.saveHistory(this.convertHistoryFile, this.convertHistory);
    this.emit('convertRecordAdded', convertRecord);
  }

  // 限制历史记录数量
  trimHistory(history) {
    if (history.length > this.maxHistoryItems) {
      history.splice(this.maxHistoryItems);
    }
  }

  // 获取下载历史
  getDownloadHistory(options = {}) {
    return this.filterHistory(this.downloadHistory, options);
  }

  // 获取转换历史
  getConvertHistory(options = {}) {
    return this.filterHistory(this.convertHistory, options);
  }

  // 过滤历史记录
  filterHistory(history, options) {
    let filtered = [...history];

    // 按日期范围过滤
    if (options.startDate) {
      filtered = filtered.filter(record => record.timestamp >= options.startDate);
    }
    if (options.endDate) {
      filtered = filtered.filter(record => record.timestamp <= options.endDate);
    }

    // 按状态过滤
    if (options.status) {
      filtered = filtered.filter(record => record.status === options.status);
    }

    // 按关键词搜索
    if (options.keyword) {
      const keyword = options.keyword.toLowerCase();
      filtered = filtered.filter(record => {
        return record.title?.toLowerCase().includes(keyword) ||
               record.url?.toLowerCase().includes(keyword) ||
               record.outputPath?.toLowerCase().includes(keyword);
      });
    }

    // 分页
    if (options.page && options.pageSize) {
      const start = (options.page - 1) * options.pageSize;
      filtered = filtered.slice(start, start + options.pageSize);
    }

    return filtered;
  }

  // 清除指定日期之前的历史记录
  clearHistoryBefore(timestamp, type = 'all') {
    if (type === 'all' || type === 'download') {
      this.downloadHistory = this.downloadHistory.filter(
        record => record.timestamp >= timestamp
      );
      this.saveHistory(this.downloadHistoryFile, this.downloadHistory);
    }

    if (type === 'all' || type === 'convert') {
      this.convertHistory = this.convertHistory.filter(
        record => record.timestamp >= timestamp
      );
      this.saveHistory(this.convertHistoryFile, this.convertHistory);
    }

    this.emit('historyCleared', { type, timestamp });
  }

  // 删除单条历史记录
  deleteRecord(recordId, type) {
    let deleted = false;
    
    if (type === 'download') {
      const index = this.downloadHistory.findIndex(record => record.id === recordId);
      if (index !== -1) {
        this.downloadHistory.splice(index, 1);
        this.saveHistory(this.downloadHistoryFile, this.downloadHistory);
        deleted = true;
      }
    } else if (type === 'convert') {
      const index = this.convertHistory.findIndex(record => record.id === recordId);
      if (index !== -1) {
        this.convertHistory.splice(index, 1);
        this.saveHistory(this.convertHistoryFile, this.convertHistory);
        deleted = true;
      }
    }

    if (deleted) {
      this.emit('recordDeleted', { type, recordId });
    }
    
    return deleted;
  }

  // 获取历史记录统计信息
  getStats() {
    const downloadStats = {
      total: this.downloadHistory.length,
      completed: 0,
      failed: 0,
      totalSize: 0
    };

    const convertStats = {
      total: this.convertHistory.length,
      completed: 0,
      failed: 0,
      totalDuration: 0
    };

    // 统计下载记录
    this.downloadHistory.forEach(record => {
      if (record.status === 'completed') {
        downloadStats.completed++;
        downloadStats.totalSize += record.size || 0;
      } else if (record.status === 'error') {
        downloadStats.failed++;
      }
    });

    // 统计转换记录
    this.convertHistory.forEach(record => {
      if (record.status === 'completed') {
        convertStats.completed++;
        convertStats.totalDuration += record.duration || 0;
      } else if (record.status === 'error') {
        convertStats.failed++;
      }
    });

    return {
      downloads: downloadStats,
      conversions: convertStats,
      lastUpdate: Date.now()
    };
  }

  // 导出历史记录
  exportHistory(type = 'all') {
    const exportData = {
      timestamp: Date.now(),
      type: type
    };

    if (type === 'all' || type === 'download') {
      exportData.downloads = this.downloadHistory;
    }

    if (type === 'all' || type === 'convert') {
      exportData.conversions = this.convertHistory;
    }

    return exportData;
  }

  // 导入历史记录
  importHistory(data) {
    try {
      if (data.downloads && (data.type === 'all' || data.type === 'download')) {
        this.downloadHistory = [...data.downloads, ...this.downloadHistory];
        this.trimHistory(this.downloadHistory);
        this.saveHistory(this.downloadHistoryFile, this.downloadHistory);
      }

      if (data.conversions && (data.type === 'all' || data.type === 'convert')) {
        this.convertHistory = [...data.conversions, ...this.convertHistory];
        this.trimHistory(this.convertHistory);
        this.saveHistory(this.convertHistoryFile, this.convertHistory);
      }

      this.emit('historyImported', {
        type: data.type,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      console.error('导入历史记录失败:', error);
      this.emit('historyError', { error: error.message });
      return false;
    }
  }
}

module.exports = new History();
