import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDb } from '../../db/schema';
import {
  deleteWatchlistItem,
  getWatchlist,
  MAX_WATCHLIST_SIZE,
  type WatchlistItem,
} from '../../db/watchlist-repo';
import { requestNotificationPermission } from '../../notifications/local-notification';
import { checkWatchlistAndNotify } from '../../notifications/run-check';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Watchlist'>;

export default function WatchlistScreen({ navigation }: Props): React.JSX.Element {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [checking, setChecking] = useState(false);

  const reload = useCallback(async () => {
    const db = await getDb();
    setItems(await getWatchlist(db));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const handleDelete = (item: WatchlistItem): void => {
    Alert.alert('刪除股票', `確定要刪除 ${item.stockCode} ${item.stockName} 嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          await deleteWatchlistItem(db, item.id);
          await reload();
        },
      },
    ]);
  };

  const handleImmediateCheck = async (): Promise<void> => {
    setChecking(true);
    try {
      await requestNotificationPermission();
      const db = await getDb();
      const results = await checkWatchlistAndNotify(db);
      const notifiedCount = results.filter((r) => r.notified).length;
      const failedCount = results.filter((r) => r.notifyError !== undefined).length;
      const failedNote = failedCount > 0 ? `，${failedCount} 個通知發送失敗` : '';
      Alert.alert(
        '立即檢查完成',
        `檢查了 ${results.length} 個策略設定，其中 ${notifiedCount} 個發出新通知${failedNote}`,
      );
    } finally {
      setChecking(false);
    }
  };

  const canAddMore = items.length < MAX_WATCHLIST_SIZE;

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button title="設定" onPress={() => navigation.navigate('Settings')} />
        <Button
          title={checking ? '檢查中...' : '立即檢查'}
          onPress={handleImmediateCheck}
          disabled={checking}
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>還沒有任何股票，按下面的「新增股票」開始</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('StockDetail', { watchlistId: item.id })}
          >
            <View style={styles.rowMain}>
              <Text style={styles.stockCode}>{item.stockCode}</Text>
              <Text style={styles.stockName}>{item.stockName}</Text>
              <Text style={styles.budget}>預算 {item.budget}</Text>
            </View>
            <View style={styles.rowActions}>
              <Button
                title="編輯"
                onPress={() => navigation.navigate('WatchlistForm', { watchlistId: item.id })}
              />
              <Button title="刪除" color="#c00" onPress={() => handleDelete(item)} />
            </View>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <Button
          title={canAddMore ? '新增股票' : `已達上限 ${MAX_WATCHLIST_SIZE} 檔`}
          onPress={() => navigation.navigate('WatchlistForm', {})}
          disabled={!canAddMore}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 32,
  },
  row: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  rowMain: {
    marginBottom: 8,
  },
  stockCode: {
    fontSize: 16,
    fontWeight: '600',
  },
  stockName: {
    fontSize: 13,
    color: '#555',
  },
  budget: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  footer: {
    padding: 16,
  },
});
