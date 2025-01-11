import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Box, 
  TextField, 
  Button, 
  Typography,
  Paper,
  Tab,
  Tabs,
  LinearProgress,
  Card,
  CardContent,
  InputAdornment,
  IconButton
} from '@mui/material';
import { 
  CloudDownload, 
  Transform, 
  ContentCut,
  ContentPaste
} from '@mui/icons-material';
import useTranslation from './hooks/useTranslation';
import LanguageSelector from './components/LanguageSelector';

const { ipcRenderer } = window.require('electron');

function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [url, setUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoInfo, setVideoInfo] = useState(null);
  const [error, setError] = useState(null);
  const [translations, setTranslations] = useState({
    title: '视频工具箱',
    downloadTab: '下载视频',
    convertTab: '格式转换',
    editTab: '视频编辑',
    urlLabel: '视频链接',
    urlPlaceholder: '在此粘贴视频链接',
    downloadButton: '下载',
    getInfoButton: '获取信息',
    progress: '下载进度',
    error: '错误',
    pasteButton: '粘贴'
  });

  useEffect(() => {
    // 监听下载进度
    ipcRenderer.on('download-progress', (event, progressData) => {
      setProgress(progressData.progress);
    });

    return () => {
      ipcRenderer.removeAllListeners('download-progress');
    };
  }, []);

  useEffect(() => {
    // 更新翻译
    const updateTranslations = async () => {
      const newTranslations = {
        title: await t('common.title'),
        downloadTab: await t('download.title'),
        convertTab: await t('convert.title'),
        editTab: await t('common.edit'),
        urlLabel: await t('download.url'),
        urlPlaceholder: await t('download.urlPlaceholder'),
        downloadButton: await t('download.start'),
        getInfoButton: await t('download.getInfo'),
        progress: await t('download.progress'),
        error: await t('common.error'),
        pasteButton: await t('common.paste')
      };
      setTranslations(newTranslations);
    };

    updateTranslations();
  }, [t]);

  const handleGetInfo = async () => {
    if (!url) return;
    
    try {
      setError(null);
      const info = await ipcRenderer.invoke('get-video-info', url);
      setVideoInfo(info);
    } catch (error) {
      setError(error.message);
      setVideoInfo(null);
    }
  };

  const handleDownload = async () => {
    if (!url) return;
    
    setDownloading(true);
    setError(null);
    try {
      const result = await ipcRenderer.invoke('download-video', {
        url,
        options: {
          format: 'mp4',
          quality: 'highest'
        }
      });
      console.log('下载完成:', result);
    } catch (error) {
      setError(error.message);
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (error) {
      console.error('Failed to paste:', error);
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            {translations.title}
          </Typography>
          <LanguageSelector />
        </Box>

        <Paper sx={{ mt: 3 }}>
          <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
            <Tab icon={<CloudDownload />} label={translations.downloadTab} />
            <Tab icon={<Transform />} label={translations.convertTab} />
            <Tab icon={<ContentCut />} label={translations.editTab} />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {activeTab === 0 && (
              <Box>
                <TextField
                  fullWidth
                  label={translations.urlLabel}
                  placeholder={translations.urlPlaceholder}
                  variant="outlined"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  sx={{ mb: 2 }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={handlePaste} edge="end">
                          <ContentPaste />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleGetInfo}
                    disabled={!url || downloading}
                  >
                    {translations.getInfoButton}
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<CloudDownload />}
                    onClick={handleDownload}
                    disabled={!url || downloading}
                  >
                    {translations.downloadButton}
                  </Button>
                </Box>

                {downloading && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      {translations.progress}: {Math.round(progress)}%
                    </Typography>
                    <LinearProgress variant="determinate" value={progress} />
                  </Box>
                )}

                {error && (
                  <Typography color="error" sx={{ mb: 2 }}>
                    {translations.error}: {error}
                  </Typography>
                )}

                {videoInfo && (
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        {videoInfo.title}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {videoInfo.description}
                      </Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

export default App;
