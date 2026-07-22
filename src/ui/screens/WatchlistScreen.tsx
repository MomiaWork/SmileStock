import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
import IconButton from '../components/IconButton';
import PillButton from '../components/PillButton';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

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
  const [refreshing, setRefreshing] = useState(false);
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

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const watchlist = await reload();
      await syncLatestPrices(watchlist.map((item) => item.stockCode));
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

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
    } catch (err) {
      Alert.alert('立即檢查失敗', err instanceof Error ? err.message : String(err));
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

  const handleAddPress = (): void => {
    if (!canAddMore) {
      Alert.alert('已達上限', `最多只能追蹤 ${MAX_WATCHLIST_SIZE} 檔股票，請先刪除一筆再新增`);
      return;
    }
    navigation.navigate('WatchlistForm', {});
  };

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => <IconButton icon="settings-outline" onPress={() => navigation.navigate('Settings')} />,
      headerRight: () => <IconButton icon="add-circle" size={28} onPress={handleAddPress} />,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, canAddMore]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolbar}
      >
        <PillButton
          label="策略建議"
          icon="bulb-outline"
          onPress={() => navigation.navigate('StrategyRecommendation')}
        />
        <PillButton
          label={checking ? '檢查中...' : '立即檢查'}
          icon="refresh-outline"
          onPress={handleImmediateCheck}
          disabled={checking}
        />
        <PillButton
          label={sharing ? '分享中...' : '分享'}
          icon="share-outline"
          onPress={handleShare}
          disabled={sharing || items.length === 0}
        />
        <PillButton
          label={analyzing ? '啟動中...' : 'Claude 分析'}
          icon="sparkles-outline"
          onPress={handleClaudeAnalyze}
          disabled={analyzing || items.length === 0}
        />
      </ScrollView>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>還沒有任何股票</Text>
            <Text style={styles.emptySubtext}>按右上角「＋」新增第一檔追蹤股票</Text>
          </View>
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
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => navigation.navigate('StockDetail', { watchlistId: item.id })}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
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

              <View style={styles.cardFooter}>
                <Text style={styles.budget}>預算 {item.budget.toLocaleString()}</Text>
                <View style={styles.cardActions}>
                  <IconButton
                    icon="pencil-outline"
                    size={18}
                    onPress={() => navigation.navigate('WatchlistForm', { watchlistId: item.id })}
                  />
                  <IconButton
                    icon="trash-outline"
                    size={18}
                    color={colors.destructive}
                    onPress={() => handleDelete(item)}
                  />
                </View>
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <Text style={styles.versionText}>
            v{appVersion}
            {buildNumber ? ` (${buildNumber})` : ''}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
  },
  emptyText: {
    ...typography.headline,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    ...typography.footnote,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: {
    flexShrink: 1,
  },
  stockCode: {
    ...typography.headline,
  },
  stockName: {
    ...typography.subheadline,
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  priceText: {
    ...typography.headline,
  },
  changeText: {
    ...typography.footnote,
    marginTop: 2,
  },
  asOfText: {
    ...typography.caption,
    marginTop: 2,
  },
  priceUp: {
    color: colors.rise,
  },
  priceDown: {
    color: colors.fall,
  },
  priceFlat: {
    color: colors.label,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  budget: {
    ...typography.footnote,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  versionText: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
