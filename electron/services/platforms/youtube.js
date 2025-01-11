const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class YouTube {
  constructor() {
    this.browser = null;
    this.page = null;
    this.userDataDir = path.join(app.getPath('userData'), 'youtube');
    
    // 确保用户数据目录存在
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: this.userDataDir,
        headless: false
      });
    }
  }

  async login(credentials) {
    try {
      await this.initBrowser();
      
      // 创建新页面
      this.page = await this.browser.newPage();
      
      // 设置视窗大小
      await this.page.setViewport({ width: 1280, height: 800 });

      // 如果有保存的cookies，尝试使用cookies登录
      if (credentials.cookies) {
        await this.page.setCookie(...credentials.cookies);
        await this.page.goto('https://www.youtube.com');
        
        // 检查是否已登录
        const isLoggedIn = await this.checkLoginStatus();
        if (isLoggedIn) {
          return true;
        }
      }

      // 使用账号密码登录
      await this.page.goto('https://accounts.google.com/signin/v2/identifier?service=youtube');
      
      // 输入邮箱
      await this.page.type('input[type="email"]', credentials.username);
      await this.page.click('#identifierNext');
      
      // 等待密码输入框
      await this.page.waitForSelector('input[type="password"]', { visible: true });
      
      // 输入密码
      await this.page.type('input[type="password"]', credentials.password);
      await this.page.click('#passwordNext');
      
      // 等待登录完成
      await this.page.waitForNavigation();
      
      // 验证登录状态
      const isLoggedIn = await this.checkLoginStatus();
      if (!isLoggedIn) {
        throw new Error('登录失败');
      }

      // 保存cookies
      const cookies = await this.page.cookies();
      return {
        cookies,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('YouTube 登录失败:', error);
      throw error;
    } finally {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
    }
  }

  async logout() {
    try {
      await this.initBrowser();
      this.page = await this.browser.newPage();
      
      // 转到YouTube
      await this.page.goto('https://www.youtube.com');
      
      // 点击头像按钮
      await this.page.click('button#avatar-btn');
      
      // 等待并点击登出按钮
      await this.page.waitForSelector('a[href="/logout"]');
      await this.page.click('a[href="/logout"]');
      
      // 等待登出完成
      await this.page.waitForNavigation();
      
      // 清除cookies
      const client = await this.page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');
      
      return true;
    } catch (error) {
      console.error('YouTube 登出失败:', error);
      throw error;
    } finally {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
    }
  }

  async checkLoginStatus() {
    try {
      // 检查是否存在上传按钮（只有登录用户才能看到）
      const uploadButton = await this.page.$('ytd-button-renderer#upload-button');
      return !!uploadButton;
    } catch (error) {
      return false;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new YouTube();
