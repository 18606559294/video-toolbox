import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, ProgressBar, Text, Card } from 'react-native-paper';
import downloader from '../services/downloader';

export default function DownloadScreen() {
  const [url, setUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoInfo, setVideoInfo] = useState(null);

  const handleGetInfo = async () => {
    if (!url) return;

    try {
      const info = await downloader.getVideoInfo(url);
      setVideoInfo(info);
    } catch (error) {
      Alert.alert('错误', `获取视频信息失败: ${error.message}`);
    }
  };

  const handleDownload = async () => {
    if (!url) return;

    setDownloading(true);
    setProgress(0);

    try {
      const result = await downloader.downloadVideo(url, (progress) => {
        setProgress(progress);
      });

      Alert.alert('成功', `视频已下载到: ${result.path}`);
    } catch (error) {
      Alert.alert('错误', `下载失败: ${error.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        label="视频链接"
        value={url}
        onChangeText={setUrl}
        mode="outlined"
        style={styles.input}
      />

      <View style={styles.buttonContainer}>
        <Button
          mode="outlined"
          onPress={handleGetInfo}
          disabled={downloading || !url}
          style={styles.button}
        >
          获取信息
        </Button>

        <Button
          mode="contained"
          onPress={handleDownload}
          disabled={downloading || !url}
          style={styles.button}
        >
          {downloading ? '下载中...' : '开始下载'}
        </Button>
      </View>

      {videoInfo && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge">视频信息</Text>
            <Text>标题: {videoInfo.title}</Text>
            <Text>时长: {videoInfo.duration}秒</Text>
          </Card.Content>
        </Card>
      )}

      {downloading && (
        <View style={styles.progressContainer}>
          <ProgressBar progress={progress} />
          <Text style={styles.progressText}>
            {Math.round(progress * 100)}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  input: {
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  button: {
    flex: 1,
    marginHorizontal: 4,
  },
  card: {
    marginBottom: 16,
  },
  progressContainer: {
    marginTop: 16,
  },
  progressText: {
    textAlign: 'center',
    marginTop: 8,
  },
});
