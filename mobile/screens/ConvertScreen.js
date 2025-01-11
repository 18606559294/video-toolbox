import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Card, Title, RadioButton, Text } from 'react-native-paper';
import DocumentPicker from 'react-native-document-picker';

export default function ConvertScreen() {
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.video],
      });
      setSelectedFile(result[0]);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        console.error('选择文件出错:', err);
      }
    }
  };

  const handleConvert = async () => {
    if (!selectedFile) return;
    
    try {
      // TODO: 实现视频转换逻辑
      console.log('开始转换:', selectedFile.name, '到', selectedFormat);
    } catch (error) {
      console.error('转换失败:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>选择视频文件</Title>
          <Button 
            mode="outlined" 
            onPress={handleFilePick}
            style={styles.button}
          >
            {selectedFile ? selectedFile.name : '选择文件'}
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Title>选择输出格式</Title>
          <RadioButton.Group 
            onValueChange={value => setSelectedFormat(value)} 
            value={selectedFormat}
          >
            <View style={styles.radioItem}>
              <RadioButton value="mp4" />
              <Text>MP4</Text>
            </View>
            <View style={styles.radioItem}>
              <RadioButton value="mkv" />
              <Text>MKV</Text>
            </View>
            <View style={styles.radioItem}>
              <RadioButton value="avi" />
              <Text>AVI</Text>
            </View>
          </RadioButton.Group>
        </Card.Content>
      </Card>

      <Button 
        mode="contained" 
        onPress={handleConvert}
        disabled={!selectedFile}
        style={styles.convertButton}
      >
        开始转换
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  card: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  convertButton: {
    marginTop: 8,
  },
});
