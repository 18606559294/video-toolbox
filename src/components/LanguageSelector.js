import React, { useState, useEffect } from 'react';
import { Select, message } from 'antd';
const { Option } = Select;

const { ipcRenderer } = window.require('electron');

const LanguageSelector = () => {
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [supportedLanguages, setSupportedLanguages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initLanguage = async () => {
      try {
        const current = await ipcRenderer.invoke('get-current-language');
        const supported = await ipcRenderer.invoke('get-supported-languages');
        setCurrentLanguage(current);
        setSupportedLanguages(supported);
      } catch (error) {
        console.error('Failed to initialize language:', error);
        message.error('Failed to initialize language settings');
      } finally {
        setLoading(false);
      }
    };

    initLanguage();

    // 监听语言变化
    const handleLanguageChange = (event, language) => {
      setCurrentLanguage(language);
    };

    ipcRenderer.on('language-changed', handleLanguageChange);

    return () => {
      ipcRenderer.removeListener('language-changed', handleLanguageChange);
    };
  }, []);

  const handleLanguageChange = async (value) => {
    try {
      const success = await ipcRenderer.invoke('change-language', value);
      if (success) {
        message.success('Language changed successfully');
      } else {
        message.error('Failed to change language');
      }
    } catch (error) {
      console.error('Failed to change language:', error);
      message.error('Failed to change language');
    }
  };

  const languageNames = {
    'en': 'English',
    'zh-CN': '简体中文',
    'ja': '日本語',
    'ko': '한국어'
  };

  if (loading) {
    return null;
  }

  return (
    <Select
      value={currentLanguage}
      onChange={handleLanguageChange}
      style={{ width: 120 }}
    >
      {supportedLanguages.map(lang => (
        <Option key={lang} value={lang}>
          {languageNames[lang] || lang}
        </Option>
      ))}
    </Select>
  );
};

export default LanguageSelector;
