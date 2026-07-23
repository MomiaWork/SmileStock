import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SettingsScreen from '../screens/SettingsScreen';
import StockDetailScreen from '../screens/StockDetailScreen';
import StrategyRecommendationScreen from '../screens/StrategyRecommendationScreen';
import WatchlistFormScreen from '../screens/WatchlistFormScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Watchlist"
        screenOptions={{
          headerTintColor: colors.tint,
          headerTitleStyle: { color: colors.label },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Watchlist" component={WatchlistScreen} options={{ title: '清單' }} />
        <Stack.Screen name="WatchlistForm" component={WatchlistFormScreen} />
        <Stack.Screen name="StockDetail" component={StockDetailScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '設定' }} />
        <Stack.Screen
          name="StrategyRecommendation"
          component={StrategyRecommendationScreen}
          options={{ title: '策略建議' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
