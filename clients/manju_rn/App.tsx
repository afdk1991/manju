/**
 * 漫剧 RN 端根组件。
 * 底部 Tab：首页 / 搜索 / 设置；首页可 push 到详情页，详情页可 push 到播放页。
 * 所有文案均为简体中文。
 */
import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {StatusBar} from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DetailScreen from './src/screens/DetailScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import {UpdaterProvider} from './src/updater';

export type RootStackParamList = {
  MainTabs: undefined;
  Detail: {seriesId: string};
  Player: {episodeId: string; title?: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{headerShown: true}}>
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{title: '首页', tabBarLabel: '首页'}}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchScreen}
        options={{title: '搜索', tabBarLabel: '搜索'}}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{title: '设置', tabBarLabel: '设置'}}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <UpdaterProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" />
        <Stack.Navigator initialRouteName="MainTabs">
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Detail"
            component={DetailScreen}
            options={{title: '详情'}}
          />
          <Stack.Screen
            name="Player"
            component={PlayerScreen}
            options={{title: '播放', headerShown: false}}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </UpdaterProvider>
  );
}
