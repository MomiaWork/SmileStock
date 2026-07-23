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
import { getPyramidState } from '../../db/pyramid-state-repo';
import { getDb } from '../../db/schema';
import { addTrade, getCurrentPosition, getTrades, type Trade } from '../../db/trade-repo';
import {
  getEnabledStrategyConfigs,
  getWatchlistItem,
  type WatchlistItem,
} from '../../db/watchlist-repo';
import { useI18n } from '../../i18n';
import { adviseEntry, type EntryAdvice } from '../../strategy-engine/entry-advisor';
import { evaluateStrategy } from '../../strategy-engine/engine';
import { adviseExit, type ExitAdvice } from '../../strategy-engine/exit-advisor';
import type { Position } from '../../strategy-engine/pnl';
import {
  evaluatePyramid,
  type PyramidConfig,
  type PyramidSignal,
} from '../../strategy-engine/pyramid-state-machine';
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

function StatusRow({ title, subtitle }: { title: string; subtitle: string }): React.JSX.Element {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusSubtitle}>{subtitle}</Text>
    </View>
  );
}

export default function StockDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { strings } = useI18n();
  const { watchlistId } = route.params;
  const [item, setItem] = useState<WatchlistItem | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [statuses, setStatuses] = useState<StrategyStatus[]>([]);
  const [pyramidStatuses, setPyramidStatuses] = useState<PyramidSignal[]>([]);
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
    // 金字塔加碼是有狀態策略，不走 evaluateStrategy/adviseEntry（那套是網格/RSI/均線交叉
    // 共用的無狀態進場建議管線），另外用自己的區塊顯示狀態
    const nonPyramidConfigs = configs.filter(
      (config): config is typeof config & { type: Exclude<typeof config.type, 'pyramid'> } =>
        config.type !== 'pyramid',
    );
    const pyramidConfigs = configs.filter((config) => config.type === 'pyramid');

    setStatuses(
      nonPyramidConfigs.map((config) => ({
        type: config.type,
        signal: evaluateStrategy(adviceHistory, { type: config.type, params: config.params }),
      })),
    );

    setTrend(classifyTrend(adviceHistory));

    setEntryAdvices(
      nonPyramidConfigs.map((config) => ({
        type: config.type,
        advice: adviseEntry(
          adviceHistory,
          { type: config.type, params: config.params },
          { momentumConfirmEnabled: watchlistItem.entryConfirmEnabled },
        ),
      })),
    );

    // 唯讀試算目前訊號給畫面顯示用，不在這裡改寫 pyramid_state——狀態的實際推進由
    // 「立即檢查」/背景任務（run-check.ts）負責，這裡只是讀最後一次存的狀態算出目前是什麼樣子
    setPyramidStatuses(
      await Promise.all(
        pyramidConfigs.map(async (config) => {
          const prevState = await getPyramidState(db, config.id);
          const { signal } = evaluatePyramid(
            adviceHistory,
            config.params as PyramidConfig,
            prevState ?? undefined,
          );
          return signal;
        }),
      ),
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
        Alert.alert(strings.stockDetail.loadFailedTitle, err instanceof Error ? err.message : String(err));
      });
    }, [reload, strings]),
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
      Alert.alert(strings.stockDetail.tradeValidation);
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
      Alert.alert(strings.stockDetail.tradeFailedTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTrade(false);
    }
  };

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={typography.body}>{strings.common.loading}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title={strings.stockDetail.sectionChart}>
        <View style={styles.chartCard}>
          <PriceLineChart history={history} />
        </View>
      </Section>

      {trend && (
        <Section title={strings.stockDetail.sectionTrend}>
          <StatusRow title={strings.stockDetail.trend[trend.face]} subtitle={trend.reason} />
        </Section>
      )}

      {entryAdvices.length > 0 && (
        <Section title={strings.stockDetail.sectionEntryAdvice}>
          {entryAdvices.map(({ type, advice }) => (
            <StatusRow
              key={type}
              title={`[${type}] ${strings.stockDetail.entryAction[advice.action]}`}
              subtitle={advice.reason}
            />
          ))}
        </Section>
      )}

      <Section title={strings.stockDetail.sectionStrategyStatus}>
        {statuses.length === 0 ? (
          <StatusRow
            title={strings.stockDetail.noStrategyTitle}
            subtitle={strings.stockDetail.noStrategySubtitle}
          />
        ) : (
          statuses.map((s, i) => (
            <StatusRow
              key={i}
              title={`[${s.type}] ${s.signal.triggered ? strings.stockDetail.triggered : strings.stockDetail.notTriggered}`}
              subtitle={s.signal.reason}
            />
          ))
        )}
      </Section>

      {pyramidStatuses.length > 0 && (
        <Section title={strings.stockDetail.sectionPyramidStatus}>
          {pyramidStatuses.map((signal, i) => (
            <StatusRow
              key={i}
              title={strings.stockDetail.pyramidStateLabel(
                strings.stockDetail.pyramidMarketState[signal.state],
                signal.tierIndex,
              )}
              subtitle={signal.reason}
            />
          ))}
        </Section>
      )}

      <Section title={strings.stockDetail.sectionPosition}>
        {position ? (
          <View style={styles.pnlCard}>
            <Text style={styles.statusSubtitle}>
              {strings.stockDetail.positionSummary(
                position.quantity,
                position.avgCost.toFixed(2),
              )}
            </Text>
            {exitAdvice && (
              <>
                <Text
                  style={[
                    styles.pnlText,
                    exitAdvice.pnl.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative,
                  ]}
                >
                  {strings.stockDetail.pnlSummary(
                    exitAdvice.pnl.marketValue.toFixed(0),
                    `${exitAdvice.pnl.pnl >= 0 ? '+' : ''}${exitAdvice.pnl.pnl.toFixed(0)}`,
                    `${exitAdvice.pnl.returnRatePercent >= 0 ? '+' : ''}${exitAdvice.pnl.returnRatePercent.toFixed(2)}`,
                  )}
                </Text>
                <Text style={styles.statusTitle}>
                  {strings.stockDetail.exitAction[exitAdvice.action]}
                </Text>
                <Text style={styles.statusSubtitle}>{exitAdvice.reason}</Text>
              </>
            )}
          </View>
        ) : (
          <StatusRow
            title={strings.stockDetail.noPositionTitle}
            subtitle={strings.stockDetail.noPositionSubtitle}
          />
        )}
      </Section>

      <Section title={strings.stockDetail.sectionRecordTrade}>
        <View style={styles.segmentRow}>
          {(['buy', 'sell'] as const).map((side) => (
            <Pressable
              key={side}
              onPress={() => setTradeSide(side)}
              style={[styles.segment, tradeSide === side && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, tradeSide === side && styles.segmentTextActive]}>
                {side === 'buy' ? strings.stockDetail.buy : strings.stockDetail.sell}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputRow
          label={strings.stockDetail.fieldTradePrice}
          value={tradePrice}
          onChangeText={setTradePrice}
          keyboardType="numeric"
        />
        <InputRow
          label={strings.stockDetail.fieldQuantity}
          value={tradeQuantity}
          onChangeText={setTradeQuantity}
          keyboardType="numeric"
        />
        <InputRow
          label={strings.stockDetail.fieldNote}
          placeholder={strings.stockDetail.placeholderOptional}
          value={tradeNote}
          onChangeText={setTradeNote}
        />
      </Section>
      <View style={styles.primaryButtonWrap}>
        <PrimaryButton
          title={tradeSide === 'buy' ? strings.stockDetail.addBuyRecord : strings.stockDetail.addSellRecord}
          onPress={() => void handleAddTrade()}
          loading={savingTrade}
        />
      </View>

      <Section title={strings.stockDetail.sectionTrades}>
        {trades.length === 0 ? (
          <StatusRow
            title={strings.stockDetail.noTradesTitle}
            subtitle={strings.stockDetail.noTradesSubtitle}
          />
        ) : (
          [...trades]
            .reverse()
            .map((t) => (
              <StatusRow
                key={t.id}
                title={strings.stockDetail.tradeSummary(
                  t.side === 'buy' ? strings.stockDetail.buy : strings.stockDetail.sell,
                  t.quantity,
                  t.price,
                )}
                subtitle={`${t.tradedAt}${t.note ? `　${t.note}` : ''}`}
              />
            ))
        )}
      </Section>

      <Section title={strings.stockDetail.sectionNotifications}>
        {notifications.length === 0 ? (
          <StatusRow
            title={strings.stockDetail.noNotificationsTitle}
            subtitle={strings.stockDetail.noNotificationsSubtitle}
          />
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
