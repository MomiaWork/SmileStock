import { registerRootComponent } from 'expo';

import App from './App';
// 背景任務要在 App 被系統喚醒（甚至 App 本身沒有在跑）時也能被找到，
// 所以 defineTask 必須在進入點無條件執行過，不能只在某個畫面掛載時才 import
import './src/background/background-fetch-task';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
