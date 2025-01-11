const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const EventEmitter = require('events');
const keytar = require('keytar');

class Auth extends EventEmitter {
  constructor() {
    super();
    // 创建凭证存储目录
    this.credentialsPath = path.join(app.getPath('userData'), 'credentials');
    if (!fs.existsSync(this.credentialsPath)) {
      fs.mkdirSync(this.credentialsPath, { recursive: true });
    }

    // 平台凭证文件
    this.platformsFile = path.join(this.credentialsPath, 'platforms.json');

    // 加载平台凭证
    this.platforms = this.loadPlatforms();

    // 登录状态
    this.loginStatus = new Map();

    // 自动登录间隔（12小时）
    this.autoLoginInterval = 12 * 60 * 60 * 1000;

    // 登录重试配置
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5秒

    // 开始自动登录检查
    this.setupAutoLogin();
  }

  // 加载平台凭证
  loadPlatforms() {
    try {
      if (fs.existsSync(this.platformsFile)) {
        return JSON.parse(fs.readFileSync(this.platformsFile, 'utf8'));
      }
    } catch (error) {
      console.error('加载平台凭证失败:', error);
    }
    return {};
  }

  // 保存平台凭证
  savePlatforms() {
    try {
      fs.writeFileSync(this.platformsFile, JSON.stringify(this.platforms, null, 2));
    } catch (error) {
      console.error('保存平台凭证失败:', error);
      this.emit('error', { error: error.message });
    }
  }

  // 加密敏感信息
  async encrypt(text) {
    const key = await this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  // 解密敏感信息
  async decrypt(encrypted, iv, authTag) {
    const key = await this.getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // 获取加密密钥
  async getEncryptionKey() {
    let key = await keytar.getPassword('video-toolbox', 'encryption-key');
    if (!key) {
      key = crypto.randomBytes(32).toString('hex');
      await keytar.setPassword('video-toolbox', 'encryption-key', key);
    }
    return Buffer.from(key, 'hex');
  }

  // 添加平台凭证
  async addPlatformCredentials(platform, credentials) {
    try {
      const { username, password, cookies, token } = credentials;
      const encrypted = {};

      if (password) {
        encrypted.password = await this.encrypt(password);
      }
      if (cookies) {
        encrypted.cookies = await this.encrypt(JSON.stringify(cookies));
      }
      if (token) {
        encrypted.token = await this.encrypt(token);
      }

      this.platforms[platform] = {
        username,
        ...encrypted,
        lastLogin: null,
        autoLogin: true
      };

      this.savePlatforms();
      this.emit('credentialsAdded', { platform });
      return true;
    } catch (error) {
      console.error('添加平台凭证失败:', error);
      this.emit('error', { error: error.message });
      return false;
    }
  }

  // 移除平台凭证
  removePlatformCredentials(platform) {
    if (this.platforms[platform]) {
      delete this.platforms[platform];
      this.savePlatforms();
      this.loginStatus.delete(platform);
      this.emit('credentialsRemoved', { platform });
      return true;
    }
    return false;
  }

  // 获取平台凭证
  async getPlatformCredentials(platform) {
    try {
      const credentials = this.platforms[platform];
      if (!credentials) return null;

      const decrypted = { username: credentials.username };

      if (credentials.password) {
        decrypted.password = await this.decrypt(
          credentials.password.encrypted,
          credentials.password.iv,
          credentials.password.authTag
        );
      }

      if (credentials.cookies) {
        decrypted.cookies = JSON.parse(await this.decrypt(
          credentials.cookies.encrypted,
          credentials.cookies.iv,
          credentials.cookies.authTag
        ));
      }

      if (credentials.token) {
        decrypted.token = await this.decrypt(
          credentials.token.encrypted,
          credentials.token.iv,
          credentials.token.authTag
        );
      }

      return decrypted;
    } catch (error) {
      console.error('获取平台凭证失败:', error);
      this.emit('error', { error: error.message });
      return null;
    }
  }

  // 更新平台凭证
  async updatePlatformCredentials(platform, credentials) {
    if (this.platforms[platform]) {
      await this.addPlatformCredentials(platform, credentials);
      this.emit('credentialsUpdated', { platform });
      return true;
    }
    return false;
  }

  // 获取所有平台
  getPlatforms() {
    return Object.keys(this.platforms).map(platform => ({
      platform,
      username: this.platforms[platform].username,
      autoLogin: this.platforms[platform].autoLogin,
      lastLogin: this.platforms[platform].lastLogin
    }));
  }

  // 设置自动登录
  setAutoLogin(platform, enabled) {
    if (this.platforms[platform]) {
      this.platforms[platform].autoLogin = enabled;
      this.savePlatforms();
      this.emit('autoLoginChanged', { platform, enabled });
      return true;
    }
    return false;
  }

  // 执行登录
  async login(platform, force = false) {
    try {
      // 检查是否已登录且未过期
      const status = this.loginStatus.get(platform);
      if (!force && status?.loggedIn && Date.now() - status.timestamp < this.autoLoginInterval) {
        return true;
      }

      const credentials = await this.getPlatformCredentials(platform);
      if (!credentials) {
        throw new Error('未找到平台凭证');
      }

      let retries = 0;
      while (retries < this.maxRetries) {
        try {
          // 执行平台特定的登录逻辑
          const platformModule = require(`./platforms/${platform}`);
          await platformModule.login(credentials);

          // 更新登录状态
          this.loginStatus.set(platform, {
            loggedIn: true,
            timestamp: Date.now()
          });

          // 更新最后登录时间
          this.platforms[platform].lastLogin = Date.now();
          this.savePlatforms();

          this.emit('loginSuccess', { platform });
          return true;
        } catch (error) {
          retries++;
          if (retries >= this.maxRetries) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    } catch (error) {
      console.error(`${platform} 登录失败:`, error);
      this.loginStatus.set(platform, {
        loggedIn: false,
        timestamp: Date.now(),
        error: error.message
      });
      this.emit('loginError', { platform, error: error.message });
      return false;
    }
  }

  // 执行登出
  async logout(platform) {
    try {
      const platformModule = require(`./platforms/${platform}`);
      await platformModule.logout();
      this.loginStatus.delete(platform);
      this.emit('logoutSuccess', { platform });
      return true;
    } catch (error) {
      console.error(`${platform} 登出失败:`, error);
      this.emit('logoutError', { platform, error: error.message });
      return false;
    }
  }

  // 检查登录状态
  isLoggedIn(platform) {
    const status = this.loginStatus.get(platform);
    return status?.loggedIn && Date.now() - status.timestamp < this.autoLoginInterval;
  }

  // 获取登录状态
  getLoginStatus(platform) {
    return this.loginStatus.get(platform) || {
      loggedIn: false,
      timestamp: null,
      error: null
    };
  }

  // 设置自动登录检查
  setupAutoLogin() {
    // 每小时检查一次登录状态
    setInterval(() => {
      Object.keys(this.platforms).forEach(platform => {
        const credentials = this.platforms[platform];
        if (credentials.autoLogin) {
          this.login(platform);
        }
      });
    }, 60 * 60 * 1000);
  }

  // 导出凭证
  async exportCredentials(password) {
    try {
      const encrypted = await this.encrypt(JSON.stringify(this.platforms));
      return {
        timestamp: Date.now(),
        data: encrypted
      };
    } catch (error) {
      console.error('导出凭证失败:', error);
      this.emit('error', { error: error.message });
      return null;
    }
  }

  // 导入凭证
  async importCredentials(data, password) {
    try {
      const decrypted = await this.decrypt(
        data.data.encrypted,
        data.data.iv,
        data.data.authTag
      );
      const platforms = JSON.parse(decrypted);

      // 验证数据格式
      for (const [platform, credentials] of Object.entries(platforms)) {
        if (!credentials.username) {
          throw new Error(`无效的凭证数据: ${platform}`);
        }
      }

      this.platforms = platforms;
      this.savePlatforms();
      this.emit('credentialsImported');
      return true;
    } catch (error) {
      console.error('导入凭证失败:', error);
      this.emit('error', { error: error.message });
      return false;
    }
  }
}

module.exports = new Auth();
