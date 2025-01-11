const { app } = require('electron');
const i18next = require('i18next');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class I18nService extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.initPromise = null;
    this.currentLanguage = 'en';
    this.supportedLanguages = ['en', 'zh-CN', 'ja', 'ko'];
    this.translations = {};

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
      // 创建语言文件目录
      this.i18nPath = path.join(app.getPath('userData'), 'i18n');
      if (!fs.existsSync(this.i18nPath)) {
        fs.mkdirSync(this.i18nPath, { recursive: true });
      }

      // 加载默认翻译
      await this.loadDefaultTranslations();

      // 初始化 i18next
      await i18next.init({
        lng: this.currentLanguage,
        fallbackLng: 'en',
        resources: this.translations,
        interpolation: {
          escapeValue: false
        }
      });

      this.initialized = true;
    } catch (error) {
      console.error('I18n initialization failed:', error);
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.waitForInit();
    }
  }

  // 加载默认翻译
  async loadDefaultTranslations() {
    // 英语
    this.translations.en = {
      translation: {
        common: {
          ok: 'OK',
          cancel: 'Cancel',
          save: 'Save',
          delete: 'Delete',
          edit: 'Edit',
          search: 'Search',
          loading: 'Loading...',
          error: 'Error',
          success: 'Success',
          warning: 'Warning',
          info: 'Information',
          title: 'Video Toolbox',
          paste: 'Paste'
        },
        menu: {
          file: 'File',
          edit: 'Edit',
          view: 'View',
          help: 'Help',
          about: 'About',
          settings: 'Settings',
          language: 'Language',
          theme: 'Theme'
        },
        download: {
          title: 'Download',
          url: 'Video URL',
          urlPlaceholder: 'Paste video URL here',
          start: 'Download',
          pause: 'Pause',
          resume: 'Resume',
          cancel: 'Cancel',
          progress: 'Progress',
          speed: 'Speed',
          size: 'Size',
          status: 'Status',
          format: 'Format',
          quality: 'Quality',
          getInfo: 'Get Video Info'
        },
        convert: {
          title: 'Convert',
          input: 'Input',
          output: 'Output',
          format: 'Format',
          start: 'Start',
          cancel: 'Cancel',
          progress: 'Progress'
        },
        history: {
          title: 'History',
          downloads: 'Downloads',
          conversions: 'Conversions',
          clear: 'Clear',
          noRecords: 'No records found'
        },
        settings: {
          title: 'Settings',
          general: 'General',
          download: 'Download',
          convert: 'Convert',
          language: 'Language',
          theme: 'Theme',
          maxConcurrent: 'Max Concurrent Downloads',
          downloadPath: 'Download Path',
          autoStart: 'Auto Start Downloads',
          clearHistory: 'Clear History'
        },
        status: {
          pending: 'Pending',
          downloading: 'Downloading',
          paused: 'Paused',
          completed: 'Completed',
          error: 'Error',
          cancelled: 'Cancelled'
        },
        errors: {
          invalidUrl: 'Invalid URL',
          networkError: 'Network Error',
          downloadError: 'Download Error',
          convertError: 'Convert Error',
          unknownError: 'Unknown Error'
        }
      }
    };

    // 简体中文
    this.translations['zh-CN'] = {
      translation: {
        common: {
          ok: '确定',
          cancel: '取消',
          save: '保存',
          delete: '删除',
          edit: '编辑',
          search: '搜索',
          loading: '加载中...',
          error: '错误',
          success: '成功',
          warning: '警告',
          info: '信息',
          title: '视频工具箱',
          paste: '粘贴'
        },
        menu: {
          file: '文件',
          edit: '编辑',
          view: '视图',
          help: '帮助',
          about: '关于',
          settings: '设置',
          language: '语言',
          theme: '主题'
        },
        download: {
          title: '下载视频',
          url: '视频链接',
          urlPlaceholder: '在此粘贴视频链接',
          start: '开始下载',
          pause: '暂停',
          resume: '继续',
          cancel: '取消',
          progress: '下载进度',
          speed: '速度',
          size: '大小',
          status: '状态',
          format: '格式',
          quality: '质量',
          getInfo: '获取视频信息'
        },
        convert: {
          title: '转换',
          input: '输入',
          output: '输出',
          format: '格式',
          start: '开始',
          cancel: '取消',
          progress: '进度'
        },
        history: {
          title: '历史记录',
          downloads: '下载记录',
          conversions: '转换记录',
          clear: '清空',
          noRecords: '没有找到记录'
        },
        settings: {
          title: '设置',
          general: '常规',
          download: '下载',
          convert: '转换',
          language: '语言',
          theme: '主题',
          maxConcurrent: '最大同时下载数',
          downloadPath: '下载路径',
          autoStart: '自动开始下载',
          clearHistory: '清空历史记录'
        },
        status: {
          pending: '等待中',
          downloading: '下载中',
          paused: '已暂停',
          completed: '已完成',
          error: '错误',
          cancelled: '已取消'
        },
        errors: {
          invalidUrl: '无效的链接',
          networkError: '网络错误',
          downloadError: '下载错误',
          convertError: '转换错误',
          unknownError: '未知错误'
        }
      }
    };

    // 日语
    this.translations.ja = {
      translation: {
        common: {
          ok: 'OK',
          cancel: 'キャンセル',
          save: '保存',
          delete: '削除',
          edit: '編集',
          search: '検索',
          loading: '読み込み中...',
          error: 'エラー',
          success: '成功',
          warning: '警告',
          info: '情報',
          title: 'ビデオツールボックス',
          paste: '貼り付け'
        },
        menu: {
          file: 'ファイル',
          edit: '編集',
          view: '表示',
          help: 'ヘルプ',
          about: 'について',
          settings: '設定',
          language: '言語',
          theme: 'テーマ'
        },
        download: {
          title: 'ダウンロード',
          url: '動画URL',
          urlPlaceholder: 'ここに動画URLを貼り付けてください',
          start: 'ダウンロード開始',
          pause: '一時停止',
          resume: '再開',
          cancel: 'キャンセル',
          progress: '進捗状況',
          speed: '速度',
          size: 'サイズ',
          status: '状態',
          format: 'フォーマット',
          quality: '品質',
          getInfo: '動画情報を取得'
        },
        convert: {
          title: '変換',
          input: '入力',
          output: '出力',
          format: 'フォーマット',
          start: '開始',
          cancel: 'キャンセル',
          progress: '進捗'
        },
        history: {
          title: '履歴',
          downloads: 'ダウンロード履歴',
          conversions: '変換履歴',
          clear: 'クリア',
          noRecords: '記録が見つかりません'
        },
        settings: {
          title: '設定',
          general: '一般',
          download: 'ダウンロード',
          convert: '変換',
          language: '言語',
          theme: 'テーマ',
          maxConcurrent: '最大同時ダウンロード数',
          downloadPath: 'ダウンロードパス',
          autoStart: '自動開始',
          clearHistory: '履歴をクリア'
        },
        status: {
          pending: '待機中',
          downloading: 'ダウンロード中',
          paused: '一時停止',
          completed: '完了',
          error: 'エラー',
          cancelled: 'キャンセル'
        },
        errors: {
          invalidUrl: '無効なURL',
          networkError: 'ネットワークエラー',
          downloadError: 'ダウンロードエラー',
          convertError: '変換エラー',
          unknownError: '不明なエラー'
        }
      }
    };

    // 韩语
    this.translations.ko = {
      translation: {
        common: {
          ok: '확인',
          cancel: '취소',
          save: '저장',
          delete: '삭제',
          edit: '편집',
          search: '검색',
          loading: '로딩 중...',
          error: '오류',
          success: '성공',
          warning: '경고',
          info: '정보',
          title: '비디오 툴박스',
          paste: '붙여넣기'
        },
        menu: {
          file: '파일',
          edit: '편집',
          view: '보기',
          help: '도움말',
          about: '정보',
          settings: '설정',
          language: '언어',
          theme: '테마'
        },
        download: {
          title: '다운로드',
          url: '비디오 URL',
          urlPlaceholder: '여기에 비디오 URL을 붙여넣으세요',
          start: '다운로드 시작',
          pause: '일시정지',
          resume: '재개',
          cancel: '취소',
          progress: '진행률',
          speed: '속도',
          size: '크기',
          status: '상태',
          format: '형식',
          quality: '품질',
          getInfo: '비디오 정보 가져오기'
        },
        convert: {
          title: '변환',
          input: '입력',
          output: '출력',
          format: '형식',
          start: '시작',
          cancel: '취소',
          progress: '진행률'
        },
        history: {
          title: '기록',
          downloads: '다운로드 기록',
          conversions: '변환 기록',
          clear: '지우기',
          noRecords: '기록이 없습니다'
        },
        settings: {
          title: '설정',
          general: '일반',
          download: '다운로드',
          convert: '변환',
          language: '언어',
          theme: '테마',
          maxConcurrent: '최대 동시 다운로드 수',
          downloadPath: '다운로드 경로',
          autoStart: '자동 시작',
          clearHistory: '기록 지우기'
        },
        status: {
          pending: '대기 중',
          downloading: '다운로드 중',
          paused: '일시정지됨',
          completed: '완료됨',
          error: '오류',
          cancelled: '취소됨'
        },
        errors: {
          invalidUrl: '잘못된 URL',
          networkError: '네트워크 오류',
          downloadError: '다운로드 오류',
          convertError: '변환 오류',
          unknownError: '알 수 없는 오류'
        }
      }
    };
  }

  // 获取翻译
  async t(key, options = {}) {
    await this.ensureInitialized();
    return i18next.t(key, options);
  }

  // 切换语言
  async changeLanguage(language) {
    await this.ensureInitialized();
    if (this.supportedLanguages.includes(language)) {
      await i18next.changeLanguage(language);
      this.currentLanguage = language;
      this.emit('languageChanged', language);
      return true;
    }
    return false;
  }

  // 获取当前语言
  async getCurrentLanguage() {
    await this.ensureInitialized();
    return this.currentLanguage;
  }

  // 获取支持的语言列表
  async getSupportedLanguages() {
    await this.ensureInitialized();
    return this.supportedLanguages;
  }

  // 获取语言名称
  async getLanguageName(language) {
    await this.ensureInitialized();
    const languageNames = {
      'en': 'English',
      'zh-CN': '简体中文',
      'ja': '日本語',
      'ko': '한국어'
    };
    return languageNames[language] || language;
  }
}

module.exports = I18nService;
