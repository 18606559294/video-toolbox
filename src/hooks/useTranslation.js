import { useState, useEffect, useCallback } from 'react';

const { ipcRenderer } = window.require('electron');

const useTranslation = () => {
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const initLanguage = async () => {
      const current = await ipcRenderer.invoke('get-current-language');
      setLanguage(current);
    };

    initLanguage();

    const handleLanguageChange = (event, newLanguage) => {
      setLanguage(newLanguage);
    };

    ipcRenderer.on('language-changed', handleLanguageChange);

    return () => {
      ipcRenderer.removeListener('language-changed', handleLanguageChange);
    };
  }, []);

  const t = useCallback(async (key, options = {}) => {
    try {
      return await ipcRenderer.invoke('get-translation', key, options);
    } catch (error) {
      console.error('Translation error:', error);
      return key;
    }
  }, []);

  return { t, language };
};

export default useTranslation;
