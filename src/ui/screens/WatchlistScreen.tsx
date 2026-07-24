import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import { getCurrentPrices, type CurrentPriceInfo } from '../../data-fetch/current-price';
import { syncPriceHistory } from '../../data-fetch/price-history-sync';
import { getDb } from '../../db/schema';
import { DEFAULT_MAX_WATCHLIST_SIZE, getMaxWatchlistSize } from '../../db/settings-repo';
import {
  deleteWatchlistItem,
  getWatchlist,
  setWatchlistOrder,
  type WatchlistItem,
} from '../../db/watchlist-repo';
import { runClaudeShortcut, shareStrategyExport } from '../../export/shortcuts-export';
import { useI18n } from '../../i18n';
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

// Android 舊架構的橋接模式預設關閉 LayoutAnimation，要手動開啟實驗旗標才會生效；
// iOS 不需要這個設定
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface WatchlistCardProps {
  item: WatchlistItem;
  index: number;
  isLast: boolean;
  priceInfo: CurrentPriceInfo | null | undefined;
  reordering: boolean;
  strings: ReturnType<typeof useI18n>['strings'];
  onPress: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** 排序編輯狀態下卡片邊框輕微晃動，模仿 iOS 主畫面圖示進入編輯模式的視覺回饋 */
function WatchlistCard({
  item,
  index,
  isLast,
  priceInfo,
  reordering,
  strings,
  onPress,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: WatchlistCardProps): React.JSX.Element {
  const [rotation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!reordering) {
      rotation.setValue(0);
      return;
    }
    // 相鄰卡片反方向晃動，視覺上比較不會像同步的機械感
    const direction = index % 2 === 0 ? 1 : -1;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rotation, {
          toValue: direction,
          duration: 120,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rotation, {
          toValue: -direction,
          duration: 240,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rotation, {
          toValue: 0,
          duration: 120,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      rotation.setValue(0);
    };
  }, [reordering, index, rotation]);

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
    <Animated.View
      style={{
        transform: [
          {
            rotate: rotation.interpolate({
              inputRange: [-1, 1],
              outputRange: ['-1.5deg', '1.5deg'],
            }),
          },
        ],
      }}
    >
      <Pressable
        style={({ pressed }) => [styles.card, pressed && !reordering && styles.cardPressed]}
        onPress={reordering ? undefined : onPress}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.stockCode}>{item.stockCode}</Text>
            <Text style={styles.stockName}>{item.stockName}</Text>
          </View>
          <View style={styles.priceBlock}>
            <Text style={[styles.priceText, changeStyle]}>
              {priceInfo ? priceInfo.price.toFixed(2) : strings.watchlist.noData}
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
                {priceInfo.isRealtime
                  ? priceInfo.asOf
                  : `${priceInfo.asOf} ${strings.watchlist.closingSuffix}`}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.budget}>
            {strings.watchlist.budgetLabel(item.budget.toLocaleString())}
          </Text>
          <View style={styles.cardActions}>
            {reordering ? (
              <>
                <IconButton
                  icon="chevron-up-outline"
                  size={18}
                  disabled={index === 0}
                  onPress={onMoveUp}
                />
                <IconButton
                  icon="chevron-down-outline"
                  size={18}
                  disabled={isLast}
                  onPress={onMoveDown}
                />
              </>
            ) : (
              <>
                <IconButton icon="pencil-outline" size={18} onPress={onEdit} />
                <IconButton
                  icon="trash-outline"
                  size={18}
                  color={colors.destructive}
                  onPress={onDelete}
                />
              </>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function WatchlistScreen({ navigation }: Props): React.JSX.Element {
  const { strings } = useI18n();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [maxWatchlistSize, setMaxWatchlistSize] = useState(DEFAULT_MAX_WATCHLIST_SIZE);
  const [priceInfoByCode, setPriceInfoByCode] = useState<Record<string, CurrentPriceInfo | null>>(
    {},
  );
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [reordering, setReordering] = useState(false);

  const reload = useCallback(async () => {
    const db = await getDb();
    const watchlist = await getWatchlist(db);
    setItems(watchlist);
    setMaxWatchlistSize(await getMaxWatchlistSize(db));
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
    Alert.alert(
      strings.watchlist.deleteTitle,
      strings.watchlist.deleteMessage(item.stockCode, item.stockName),
      [
        { text: strings.watchlist.cancel, style: 'cancel' },
        {
          text: strings.watchlist.delete,
          style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await deleteWatchlistItem(db, item.id);
            await reload();
          },
        },
      ],
    );
  };

  /**
   * 排序編輯狀態下的移動只改本地 state，不寫 DB——完全同步、零 await，
   * configureNext 跟 setItems 之間不會有任何非同步空隙，動畫保證每次都能準確
   * 註冊上；也因為整段是同步執行，快速連續點擊不會有兩次呼叫互相交錯讀寫的問題
   * （JS 是單執行緒，一次點擊的處理一定會跑完才輪到下一次）。實際寫回 DB 延後到
   * 使用者按「完成」離開排序編輯狀態時才一次做（見 handleToggleReorder）。
   */
  const handleMove = (item: WatchlistItem, direction: 'up' | 'down'): void => {
    const index = items.findIndex((i) => i.id === item.id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems(reordered);
  };

  const handleToggleReorder = async (): Promise<void> => {
    if (reordering) {
      const db = await getDb();
      await setWatchlistOrder(
        db,
        items.map((item) => item.id),
      );
    }
    setReordering((prev) => !prev);
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
      const failedNote =
        failedCount > 0 ? strings.watchlist.notifiedFailedNote(failedCount) : '';
      const syncNote = syncError ? strings.watchlist.syncFailedNote(syncError) : '';
      Alert.alert(
        strings.watchlist.checkCompleteTitle,
        strings.watchlist.checkCompleteMessage(results.length, notifiedCount, failedNote + syncNote),
      );
    } catch (err) {
      Alert.alert(strings.watchlist.checkFailedTitle, err instanceof Error ? err.message : String(err));
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
      Alert.alert(strings.watchlist.shareFailedTitle, err instanceof Error ? err.message : String(err));
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
      Alert.alert(strings.watchlist.claudeFailedTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const canAddMore = items.length < maxWatchlistSize;

  const handleAddPress = (): void => {
    if (!canAddMore) {
      Alert.alert(
        strings.watchlist.limitReachedTitle,
        strings.watchlist.limitReachedMessage(maxWatchlistSize),
      );
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
      <View style={styles.toolbar}>
        <PillButton
          label={strings.watchlist.strategyRecommendation}
          icon="bulb-outline"
          onPress={() => navigation.navigate('StrategyRecommendation')}
        />
        <PillButton
          label={checking ? strings.watchlist.checking : strings.watchlist.immediateCheck}
          icon="refresh-outline"
          onPress={handleImmediateCheck}
          disabled={checking}
        />
        <PillButton
          label={sharing ? strings.watchlist.sharing : strings.watchlist.share}
          icon="share-outline"
          onPress={handleShare}
          disabled={sharing || items.length === 0}
        />
        <PillButton
          label={analyzing ? strings.watchlist.claudeAnalyzing : strings.watchlist.claudeAnalyze}
          icon="sparkles-outline"
          onPress={handleClaudeAnalyze}
          disabled={analyzing || items.length === 0}
        />
        <PillButton
          label={strings.watchlist.notificationHistory}
          icon="notifications-outline"
          onPress={() => navigation.navigate('NotificationHistory')}
        />
        <PillButton
          label={reordering ? strings.watchlist.reorderDone : strings.watchlist.reorder}
          icon={reordering ? 'checkmark-outline' : 'swap-vertical-outline'}
          onPress={() => void handleToggleReorder()}
          disabled={items.length < 2}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{strings.watchlist.emptyTitle}</Text>
            <Text style={styles.emptySubtext}>{strings.watchlist.emptySubtitle}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <WatchlistCard
            item={item}
            index={index}
            isLast={index === items.length - 1}
            priceInfo={priceInfoByCode[item.stockCode]}
            reordering={reordering}
            strings={strings}
            onPress={() => navigation.navigate('StockDetail', { watchlistId: item.id })}
            onMoveUp={() => handleMove(item, 'up')}
            onMoveDown={() => handleMove(item, 'down')}
            onEdit={() => navigation.navigate('WatchlistForm', { watchlistId: item.id })}
            onDelete={() => handleDelete(item)}
          />
        )}
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
    flexWrap: 'wrap',
    alignItems: 'flex-start',
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
