import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getNotificationHistory,
  type NotificationHistoryEntry,
} from '../../db/notification-log-repo';
import { getPriceHistory } from '../../db/price-history-repo';
import { getDb } from '../../db/schema';
import {
  getEnabledStrategyConfigs,
  getWatchlistItem,
  type WatchlistItem,
} from '../../db/watchlist-repo';
import { evaluateStrategy } from '../../strategy-engine/engine';
import type { PricePoint, StrategySignal } from '../../strategy-engine/types';
import PriceLineChart from '../components/PriceLineChart';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'StockDetail'>;

interface StrategyStatus {
  type: string;
  signal: StrategySignal;
}

export default function StockDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { watchlistId } = route.params;
  const [item, setItem] = useState<WatchlistItem | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [statuses, setStatuses] = useState<StrategyStatus[]>([]);
  const [notifications, setNotifications] = useState<NotificationHistoryEntry[]>([]);

  const reload = useCallback(async () => {
    const db = await getDb();
    const watchlistItem = await getWatchlistItem(db, watchlistId);
    setItem(watchlistItem);
    if (!watchlistItem) return;

    navigation.setOptions({ title: `${watchlistItem.stockCode} ${watchlistItem.stockName}` });

    const priceHistory = await getPriceHistory(db, watchlistItem.stockCode);
    setHistory(priceHistory);

    const configs = await getEnabledStrategyConfigs(db, watchlistId);
    setStatuses(
      configs.map((config) => ({
        type: config.type,
        signal: evaluateStrategy(priceHistory, { type: config.type, params: config.params }),
      })),
    );

    setNotifications(await getNotificationHistory(db, watchlistId));
  }, [watchlistId, navigation]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  if (!item) {
    return (
      <View style={styles.container}>
        <Text>載入中...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>價格走勢</Text>
      <PriceLineChart history={history} />

      <Text style={styles.sectionTitle}>目前策略狀態</Text>
      {statuses.length === 0 && <Text style={styles.emptyText}>這檔股票沒有啟用任何策略</Text>}
      {statuses.map((s, i) => (
        <View key={i} style={styles.statusRow}>
          <Text style={styles.statusType}>
            [{s.type}] {s.signal.triggered ? '🔴 已觸發' : '⚪️ 未觸發'}
          </Text>
          <Text style={styles.statusReason}>{s.signal.reason}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>歷史觸發記錄</Text>
      {notifications.length === 0 && <Text style={styles.emptyText}>還沒有發送過通知</Text>}
      {notifications.map((n) => (
        <View key={n.id} style={styles.historyRow}>
          <Text style={styles.historyText}>
            {n.sentAt} [{n.strategyType}] {n.signalKey}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 13,
  },
  statusRow: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  statusType: {
    fontWeight: '600',
    marginBottom: 4,
  },
  statusReason: {
    fontSize: 12,
    color: '#555',
  },
  historyRow: {
    paddingVertical: 4,
  },
  historyText: {
    fontSize: 12,
    color: '#555',
  },
});
