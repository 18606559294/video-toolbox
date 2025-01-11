import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import HomeScreen from './screens/HomeScreen';
import DownloadScreen from './screens/DownloadScreen';
import ConvertScreen from './screens/ConvertScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <PaperProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen 
            name="Home" 
            component={HomeScreen} 
            options={{ title: '视频工具箱' }}
          />
          <Stack.Screen 
            name="Download" 
            component={DownloadScreen} 
            options={{ title: '视频下载' }}
          />
          <Stack.Screen 
            name="Convert" 
            component={ConvertScreen} 
            options={{ title: '格式转换' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
