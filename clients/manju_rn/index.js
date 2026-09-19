/**
 * @format
 * 应用入口。根据平台加载原生模块（Android 的更新模块在主应用时已注册）。
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
