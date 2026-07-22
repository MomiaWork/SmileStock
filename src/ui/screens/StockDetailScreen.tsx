import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getCurrentPrices, mergeLivePriceIntoHistory } from '../../data-fetch/current-price';
import {
  getNotificationHistory,
  type NotificationHistoryEntry,
} from '../../db/notification-log-repo';
import { getPriceHistory } from '../../db/price-history-repo';
import { getDb } from '../../db/schema';
import { addTrade, getCurrentPosition, getTrades, type Trade } from '../../db/trade-repo';
import {
  getEnabledStrategyConfigs,
  getWatchlistItem,
  type WatchlistItem,
} from '../../db/watchlist-repo';
import { adviseEntry, type EntryAdvice } from '../../strategy-engine/entry-advisor';
import { evaluateStrategy } from '../../strategy-engine/engine';
import { adviseExit, type ExitAdvice } from '../../strategy-engine/exit-advisor';
import type { Position } from '../../strategy-engine/pnl';
import { classifyTrend, type TrendClassification } from '../../strategy-engine/trend-classifier';
import type { PricePoint, StrategySignal } from '../../strategy-engine/types';
import PriceLineChart from '../components/PriceLineChart';
import PrimaryButton from '../components/PrimaryButton';
import { InputRow } from '../components/Row';
import Section from '../components/Section';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StockDetail'>;

interface StrategyStatus {
  type: string;
  signal: StrategySignal;
}

const TREND_LABEL: Record<TrendClassification['face'], string> = {
  smile: '😊 笑臉（止穩反彈）',
  cry: '😢 哭臉（持續破底）',
  neutral: '😐 中性（趨勢不明）',
};

const ENTRY_ACTION_LABEL: Record<EntryAdvice['action'], string> = {
  enter: '🟢 建議進場',
  wait: '🟡 建議觀望',
  no_signal: '⚪️ 尚未觸發網格',
};

const EXIT_ACTION_LABEL: Record<ExitAdvice['action'], string> = {
  exit_take_profit: '🟢 建議停利出場',
  exit_stop_loss: '🔴 建議停損出場',
  hold: '🟡 建議續抱',
};

function StatusRow({ title, subtitle }: { title: string; subtitle: string }): React.JSX.Element {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusSubtitle}>{subtitle}</Text>
    </View>
  );
}

export default function StockDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { watchlistId } = route.params;
  const [item, setItem] = useState<WatchlistItem | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [statuses, setStatuses] = useState<StrategyStatus[]>([]);
  const [notifications, setNotifications] = useState<NotificationHistoryEntry[]>([]);
  const [trend, setTrend] = useState<TrendClassification | null>(null);
  const [entryAdvices, setEntryAdvices] = useState<{ type: string; advice: EntryAdvice }[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [exitAdvice, setExitAdvice] = useState<ExitAdvice | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);

  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [tradeNote, setTradeNote] = useState('');
  const [savingTrade, setSavingTrade] = useState(false);

  const reload = useCallback(async () => {
    const db = await getDb();
    const watchlistItem = await getWatchlistItem(db, watchlistId);
    setItem(watchlistItem);
    if (!watchlistItem) return;

    navigation.setOptions({ title: `${watchlistItem.stockCode} ${watchlistItem.stockName}` });

    const priceHistory = await getPriceHistory(db, watchlistItem.stockCode);

    // 走勢圖、進場/出場建議、趨勢與策略狀態都要依「現在」判斷，不能卡在 price_history
    // 最新一筆可能是前一交易日（甚至今天背景同步還沒跑過）的收盤價，所以統一併入盤中最新報價
    const currentPriceInfo = (
      await getCurrentPrices(db, [watchlistItem.stockCode])
    )[watchlistItem.stockCode];
    const adviceHistory = mergeLivePriceIntoHistory(priceHistory, currentPriceInfo ?? null);
    setHistory(adviceHistory);

    const configs = await getEnabledStrategyConfigs(db, watchlistId);
    setStatuses(
      configs.map((config) => ({
        type: config.type,
        signal: evaluateStrategy(adviceHistory, { type: config.type, params: config.params }),
      })),
    );

    setTrend(classifyTrend(adviceHistory));

    setEntryAdvices(
      configs.map((config) => ({
        type: config.type,
        advice: adviseEntry(
          adviceHistory,
          { type: config.type, params: config.params },
          { momentumConfirmEnabled: watchlistItem.entryConfirmEnabled },
        ),
      })),
    );

    const currentPosition = await getCurrentPosition(db, watchlistId);
    setPosition(currentPosition);
    const currentPrice =
      currentPriceInfo?.price ??
      (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].close : null);
    setExitAdvice(
      currentPosition && currentPrice !== null
        ? adviseExit(currentPosition, currentPrice, {
            takeProfitPercent: watchlistItem.takeProfitPercent ?? undefined,
            stopLossPercent: watchlistItem.stopLossPercent ?? undefined,
          })
        : null,
    );

    setTrades(await getTrades(db, watchlistId));
    setNotifications(await getNotificationHistory(db, watchlistId));
  }, [watchlistId, navigation]);

  useFocusEffect(
    useCallback(() => {
      reload().catch((err) => {
        Alert.alert('讀取股票資料失敗', err instanceof Error ? err.message : String(err));
      });
    }, [reload]),
  );

  const handleAddTrade = async (): Promise<void> => {
    const priceNum = Number(tradePrice);
    const quantityNum = Number(tradeQuantity);
    if (
      !Number.isFinite(priceNum) ||
      priceNum <= 0 ||
      !Number.isFinite(quantityNum) ||
      quantityNum <= 0
    ) {
      Alert.alert('請確認成交價與股數都已正確填寫');
      return;
    }

    setSavingTrade(true);
    try {
      const db = await getDb();
      await addTrade(db, {
        watchlistId,
        side: tradeSide,
        price: priceNum,
        quantity: quantityNum,
        note: tradeNote.trim() || undefined,
      });
      setTradePrice('');
      setTradeQuantity('');
      setTradeNote('');
      await reload();
    } catch (err) {
      Alert.alert('記錄交易失敗', err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTrade(false);
    }
  };

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={typography.body}>載入中...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="價格走勢">
        <View style={styles.chartCard}>
          <PriceLineChart history={history} />
        </View>
      </Section>

      {trend && (
        <Section title="目前趨勢">
          <StatusRow title={TREND_LABEL[trend.face]} subtitle={trend.reason} />
        </Section>
      )}

      {entryAdvices.length > 0 && (
        <Section title="進場建議">
          {entryAdvices.map(({ type, advice }) => (
            <StatusRow
              key={type}
              title={`[${type}] ${ENTRY_ACTION_LABEL[advice.action]}`}
              subtitle={advice.reason}
            />
          ))}
        </Section>
      )}

      <Section title="目前策略狀態">
        {statuses.length === 0 ? (
          <StatusRow title="沒有啟用任何策略" subtitle="到編輯股票頁面開啟策略後會顯示在這裡" />
        ) : (
          statuses.map((s, i) => (
            <StatusRow
              key={i}
              title={`[${s.type}] ${s.signal.triggered ? '🔴 已觸發' : '⚪️ 未觸發'}`}
              subtitle={s.signal.reason}
            />
          ))
        )}
      </Section>

      <Section title="持倉與損益">
        {position ? (
          <View style={styles.pnlCard}>
            <Text style={styles.statusSubtitle}>
              持有 {position.quantity} 股，平均成本 {position.avgCost.toFixed(2)}
            </Text>
            {exitAdvice && (
              <>
                <Text
                  style={[
                    styles.pnlText,
                    exitAdvice.pnl.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative,
                  ]}
                >
                  目前市值 {exitAdvice.pnl.marketValue.toFixed(0)}，損益{' '}
                  {exitAdvice.pnl.pnl >= 0 ? '+' : ''}
                  {exitAdvice.pnl.pnl.toFixed(0)}（報酬率{' '}
                  {exitAdvice.pnl.returnRatePercent >= 0 ? '+' : ''}
                  {exitAdvice.pnl.returnRatePercent.toFixed(2)}%）
                </Text>
                <Text style={styles.statusTitle}>{EXIT_ACTION_LABEL[exitAdvice.action]}</Text>
                <Text style={styles.statusSubtitle}>{exitAdvice.reason}</Text>
              </>
            )}
          </View>
        ) : (
          <StatusRow title="目前沒有持倉" subtitle="記錄一筆買入交易後會顯示持倉與損益" />
        )}
      </Section>

      <Section title="記錄交易">
        <View style={styles.segmentRow}>
          {(['buy', 'sell'] as const).map((side) => (
            <Pressable
              key={side}
              onPress={() => setTradeSide(side)}
              style={[styles.segment, tradeSide === side && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, tradeSide === side && styles.segmentTextActive]}>
                {side === 'buy' ? '買入' : '賣出'}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputRow
          label="成交價"
          value={tradePrice}
          onChangeText={setTradePrice}
          keyboardType="numeric"
        />
        <InputRow
          label="股數"
          value={tradeQuantity}
          onChangeText={setTradeQuantity}
          keyboardType="numeric"
        />
        <InputRow
          label="備註"
          placeholder="選填"
          value={tradeNote}
          onChangeText={setTradeNote}
        />
      </Section>
      <View style={styles.primaryButtonWrap}>
        <PrimaryButton
          title={`新增${tradeSide === 'buy' ? '買入' : '賣出'}記錄`}
          onPress={() => void handleAddTrade()}
          loading={savingTrade}
        />
      </View>

      <Section title="交易紀錄">
        {trades.length === 0 ? (
          <StatusRow title="還沒有任何交易記錄" subtitle="記錄買賣後會顯示在這裡" />
        ) : (
          [...trades]
            .reverse()
            .map((t) => (
              <StatusRow
                key={t.id}
                title={`${t.side === 'buy' ? '買入' : '賣出'} ${t.quantity} 股 @ ${t.price}`}
                subtitle={`${t.tradedAt}${t.note ? `　${t.note}` : ''}`}
              />
            ))
        )}
      </Section>

      <Section title="歷史觸發記錄">
        {notifications.length === 0 ? (
          <StatusRow title="還沒有發送過通知" subtitle="策略觸發時會記錄在這裡" />
        ) : (
          notifications.map((n) => (
            <StatusRow key={n.id} title={`[${n.strategyType}] ${n.signalKey}`} subtitle={n.sentAt} />
          ))
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonWrap: {
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  chartCard: {
    alignItems: 'center',
    padding: spacing.md,
  },
  statusRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statusTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusSubtitle: {
    ...typography.footnote,
  },
  pnlCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pnlText: {
    ...typography.headline,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  pnlPositive: {
    color: colors.profit,
  },
  pnlNegative: {
    color: colors.loss,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  segment: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.fillSecondary,
  },
  segmentActive: {
    backgroundColor: colors.tint,
  },
  segmentText: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.secondaryLabel,
  },
  segmentTextActive: {
    color: '#fff',
  },
});
