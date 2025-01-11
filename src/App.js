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
  CardContent
} from '@mui/material';
import { 
  CloudDownload, 
  Transform, 
  ContentCut 
} from '@mui/icons-material';

const { ipcRenderer } = window.require('electron');

function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [url, setUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoInfo, setVideoInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 监听下载进度
    ipcRenderer.on('download-progress', (event, progressData) => {
      setProgress(progressData.progress);
    });

    return () => {
      ipcRenderer.removeAllListeners('download-progress');
    };
  }, []);

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

  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          视频工具箱
        </Typography>

        <Paper sx={{ mt: 3 }}>
          <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
            <Tab icon={<CloudDownload />} label="下载视频" />
            <Tab icon={<Transform />} label="格式转换" />
            <Tab icon={<ContentCut />} label="视频编辑" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {activeTab === 0 && (
              <Box>
                <TextField
                  fullWidth
                  label="视频链接"
                  variant="outlined"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  sx={{ mb: 2 }}
                />
                
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handleGetInfo}
                    disabled={downloading || !url}
                    sx={{ mr: 1 }}
                  >
                    获取视频信息
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<CloudDownload />}
                    onClick={handleDownload}
                    disabled={downloading || !url}
                  >
                    {downloading ? '下载中...' : '开始下载'}
                  </Button>
                </Box>

                {error && (
                  <Typography color="error" sx={{ mb: 2 }}>
                    错误: {error}
                  </Typography>
                )}

                {videoInfo && (
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="h6">视频信息</Typography>
                      <Typography>标题: {videoInfo.title}</Typography>
                      <Typography>时长: {videoInfo.duration}秒</Typography>
                    </CardContent>
                  </Card>
                )}

                {downloading && (
                  <Box sx={{ width: '100%' }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={progress * 100} 
                    />
                    <Typography align="center" sx={{ mt: 1 }}>
                      {Math.round(progress * 100)}%
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {activeTab === 1 && (
              <Typography>格式转换功能开发中...</Typography>
            )}

            {activeTab === 2 && (
              <Typography>视频编辑功能开发中...</Typography>
            )}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

export default App;
