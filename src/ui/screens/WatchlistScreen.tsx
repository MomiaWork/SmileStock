import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Alert, Button, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { getCurrentPrices, type CurrentPriceInfo } from '../../data-fetch/current-price';
import { syncPriceHistory } from '../../data-fetch/price-history-sync';
import { getDb } from '../../db/schema';
import {
  deleteWatchlistItem,
  getWatchlist,
  MAX_WATCHLIST_SIZE,
  type WatchlistItem,
} from '../../db/watchlist-repo';
import { runClaudeShortcut, shareStrategyExport } from '../../export/shortcuts-export';
import { requestNotificationPermission } from '../../notifications/local-notification';
import { checkWatchlistAndNotify } from '../../notifications/run-check';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Watchlist'>;

const appVersion = Constants.expoConfig?.version ?? '';
const buildNumber =
  Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : String(Constants.expoConfig?.android?.versionCode ?? '');

export default function WatchlistScreen({ navigation }: Props): React.JSX.Element {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [priceInfoByCode, setPriceInfoByCode] = useState<Record<string, CurrentPriceInfo | null>>(
    {},
  );
  const [checking, setChecking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const reload = useCallback(async () => {
    const db = await getDb();
    const watchlist = await getWatchlist(db);
    setItems(watchlist);
    setPriceInfoByCode(
      await getCurrentPrices(
        db,
        watchlist.map((item) => item.stockCode),
      ),
    );
    return watchlist;
  }, []);

  /** 向 TWSE 抓最新成交價寫入 DB；失敗時回傳錯誤訊息但不丟例外，讓畫面照樣顯示既有資料 */
  const syncLatestPrices = useCallback(
    async (stockCodes: string[]): Promise<string | undefined> => {
      if (stockCodes.length === 0) return undefined;
      const db = await getDb();
      try {
        await syncPriceHistory(db, stockCodes);
        return undefined;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        // 先顯示（含即時報價），每日收盤價同步在背景跑就好，不用為它再刷新一次畫面——
        // 目前價格的主要來源是即時報價，同步每日資料只影響「即時報價拿不到時」的 fallback，
        // 不值得為這個邊角案例讓 MIS 端點多打一次
        const watchlist = await reload();
        void syncLatestPrices(watchlist.map((item) => item.stockCode));
      })();
    }, [reload, syncLatestPrices]),
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

      const syncError = await syncLatestPrices(items.map((item) => item.stockCode));
      const results = await checkWatchlistAndNotify(db);
      await reload();

      const notifiedCount = results.filter((r) => r.notified).length;
      const failedCount = results.filter((r) => r.notifyError !== undefined).length;
      const failedNote = failedCount > 0 ? `，${failedCount} 個通知發送失敗` : '';
      const syncNote = syncError ? `\n\n更新最新成交價失敗，改用既有歷史資料：${syncError}` : '';
      Alert.alert(
        '立即檢查完成',
        `檢查了 ${results.length} 個策略設定，其中 ${notifiedCount} 個發出新通知${failedNote}${syncNote}`,
      );
    } finally {
      setChecking(false);
    }
  };

  const handleShare = async (): Promise<void> => {
    setSharing(true);
    try {
      const db = await getDb();
      await shareStrategyExport(db);
    } catch (err) {
      Alert.alert('分享失敗', err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  };

  const handleClaudeAnalyze = async (): Promise<void> => {
    setAnalyzing(true);
    try {
      const db = await getDb();
      await runClaudeShortcut(db);
    } catch (err) {
      Alert.alert('執行捷徑失敗', err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const canAddMore = items.length < MAX_WATCHLIST_SIZE;

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button title="設定" onPress={() => navigation.navigate('Settings')} />
        <Button
          title="策略建議"
          onPress={() => navigation.navigate('StrategyRecommendation')}
        />
        <Button
          title={checking ? '檢查中...' : '立即檢查'}
          onPress={handleImmediateCheck}
          disabled={checking}
        />
        <Button
          title={sharing ? '分享中...' : '分享'}
          onPress={handleShare}
          disabled={sharing || items.length === 0}
        />
        <Button
          title={analyzing ? '啟動中...' : 'Claude 分析'}
          onPress={handleClaudeAnalyze}
          disabled={analyzing || items.length === 0}
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>還沒有任何股票，按下面的「新增股票」開始</Text>
        }
        renderItem={({ item }) => {
          const priceInfo = priceInfoByCode[item.stockCode];
          const { changeAmount, changePercent } = priceInfo ?? {
            changeAmount: null,
            changePercent: null,
          };
          const changeStyle =
            changeAmount === null
              ? styles.priceFlat
              : changeAmount > 0
                ? styles.priceUp
                : changeAmount < 0
                  ? styles.priceDown
                  : styles.priceFlat;

          return (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate('StockDetail', { watchlistId: item.id })}
            >
              <View style={styles.rowMain}>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.stockCode}>{item.stockCode}</Text>
                    <Text style={styles.stockName}>{item.stockName}</Text>
                  </View>
                  <View style={styles.priceBlock}>
                    <Text style={[styles.priceText, changeStyle]}>
                      {priceInfo ? priceInfo.price.toFixed(2) : '尚無資料'}
                    </Text>
                    {changeAmount !== null && changePercent !== null && (
                      <Text style={[styles.changeText, changeStyle]}>
                        {changeAmount >= 0 ? '▲' : '▼'} {Math.abs(changeAmount).toFixed(2)} (
                        {changePercent >= 0 ? '+' : ''}
                        {changePercent.toFixed(2)}%)
                      </Text>
                    )}
                    {priceInfo && (
                      <Text style={styles.asOfText}>
                        {priceInfo.isRealtime ? priceInfo.asOf : `${priceInfo.asOf} 收盤`}
                      </Text>
                    )}
                  </View>
                </View>
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
          );
        }}
      />

      <View style={styles.footer}>
        <Button
          title={canAddMore ? '新增股票' : `已達上限 ${MAX_WATCHLIST_SIZE} 檔`}
          onPress={() => navigation.navigate('WatchlistForm', {})}
          disabled={!canAddMore}
        />
        <Text style={styles.versionText}>
          v{appVersion}
          {buildNumber ? ` (${buildNumber})` : ''}
        </Text>
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
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  priceBlock: {
    alignItems: 'flex-end',
  },
  priceText: {
    fontSize: 16,
    fontWeight: '600',
  },
  changeText: {
    fontSize: 12,
    marginTop: 2,
  },
  asOfText: {
    fontSize: 10,
    color: '#aaa',
    marginTop: 2,
  },
  priceUp: {
    color: '#c00',
  },
  priceDown: {
    color: '#0a7d2c',
  },
  priceFlat: {
    color: '#333',
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  footer: {
    padding: 16,
  },
  versionText: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 12,
    marginTop: 8,
  },
});
