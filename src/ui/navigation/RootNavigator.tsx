import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SettingsScreen from '../screens/SettingsScreen';
import StockDetailScreen from '../screens/StockDetailScreen';
import WatchlistFormScreen from '../screens/WatchlistFormScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Watchlist">
        <Stack.Screen
          name="Watchlist"
          component={WatchlistScreen}
          options={{ title: '股票清單' }}
        />
        <Stack.Screen name="WatchlistForm" component={WatchlistFormScreen} />
        <Stack.Screen name="StockDetail" component={StockDetailScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '設定' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
