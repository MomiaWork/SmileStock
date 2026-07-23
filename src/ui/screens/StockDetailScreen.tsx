import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
import { routeRecommendation, type RoutedRecommendation } from '../../strategy-engine/engine';
import {
  adviseExit,
  type ExitAdvice,
  type ExitRegimeContext,
} from '../../strategy-engine/exit-advisor';
import type { Position } from '../../strategy-engine/pnl';
import {
  reconcilePosition,
  type ReconciliationMismatch,
} from '../../strategy-engine/pyramid-reconciliation';
import {
  evaluatePyramid,
  type PyramidConfig,
  type PyramidSignal,
} from '../../strategy-engine/pyramid-state-machine';
import { classifyTrend, type TrendClassification } from '../../strategy-engine/trend-classifier';
import type { PricePoint } from '../../strategy-engine/types';
import PriceLineChart from '../components/PriceLineChart';
import PrimaryButton from '../components/PrimaryButton';
import { InputRow } from '../components/Row';
import Section from '../components/Section';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StockDetail'>;

/** 台股一張 = 1000 股，交易紀錄表單的股數建議以整張為單位 */
const LOT_SIZE = 1000;

interface TradeSuggestion {
  side: 'buy' | 'sell';
  price: string;
  quantity: string;
}

/**
 * 把「今天該做的事」的建議金額/出場動作換算成交易紀錄表單的預填值，讓使用者按建議
 * 操作後不用重新手動算股數。這只是預填，不會自動寫入 DB——實際成交價/股數以使用者
 * 在下方表單核對、送出的為準（App 不代下單，見 db/trade-repo.ts 的說明）。
 */
function suggestTradeInputs(
  rec: RoutedRecommendation,
  price: number,
  currentPosition: Position | null,
): TradeSuggestion | null {
  if ((rec.action === 'enter' || rec.action === 'add') && rec.amount) {
    const lots = Math.max(1, Math.round(rec.amount / price / LOT_SIZE));
    return { side: 'buy', price: price.toFixed(2), quantity: String(lots * LOT_SIZE) };
  }
  if (rec.action === 'exit' && currentPosition) {
    return { side: 'sell', price: price.toFixed(2), quantity: String(currentPosition.quantity) };
  }
  return null;
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
  const [gridAdvice, setGridAdvice] = useState<EntryAdvice | null>(null);
  const [pyramidStatus, setPyramidStatus] = useState<PyramidSignal | null>(null);
  const [routedRecommendation, setRoutedRecommendation] = useState<RoutedRecommendation | null>(
    null,
  );
  const [notifications, setNotifications] = useState<NotificationHistoryEntry[]>([]);
  const [trend, setTrend] = useState<TrendClassification | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [exitAdvice, setExitAdvice] = useState<ExitAdvice | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [advicePrice, setAdvicePrice] = useState<number | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationMismatch | null>(null);

  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [tradeNote, setTradeNote] = useState('');
  const [savingTrade, setSavingTrade] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const tradeSectionOffsetRef = useRef(0);

  const reload = useCallback(async () => {
    const db = await getDb();
    const watchlistItem = await getWatchlistItem(db, watchlistId);
    setItem(watchlistItem);
    if (!watchlistItem) return;

    navigation.setOptions({ title: `${watchlistItem.stockCode} ${watchlistItem.stockName}` });

    const priceHistory = await getPriceHistory(db, watchlistItem.stockCode);

    // 走勢圖、進場/出場建議、趨勢與策略狀態都要依「現在」判斷，不能卡在 price_history
    // 最新一筆可能是前一交易日（甚至今天背景同步還沒跑過）的收盤價，所以統一併入盤中最新報價
    const currentPriceInfo = (await getCurrentPrices(db, [watchlistItem.stockCode]))[
      watchlistItem.stockCode
    ];
    const adviceHistory = mergeLivePriceIntoHistory(priceHistory, currentPriceInfo ?? null);
    setHistory(adviceHistory);

    const configs = await getEnabledStrategyConfigs(db, watchlistId);
    // 舊版曾允許 rsi/ma_cross 當獨立策略，這類設定列可能仍留在 DB；它們已內化成
    // 進場確認濾網（momentum-confirm.ts），畫面上不再各自顯示技術指標狀態
    const gridConfigEntry = configs.find((config) => config.type === 'grid') ?? null;
    const pyramidConfigEntry = configs.find((config) => config.type === 'pyramid') ?? null;

    setTrend(classifyTrend(adviceHistory));

    setGridAdvice(
      gridConfigEntry
        ? adviseEntry(
            adviceHistory,
            { type: 'grid', params: gridConfigEntry.params },
            { momentumConfirmEnabled: watchlistItem.entryConfirmEnabled },
          )
        : null,
    );

    // 唯讀試算目前訊號給畫面顯示用，不在這裡改寫 pyramid_state——狀態的實際推進由
    // 「立即檢查」/背景任務（run-check.ts）負責，這裡只是讀最後一次存的狀態算出目前是什麼樣子
    const pyramidPrevState = pyramidConfigEntry
      ? await getPyramidState(db, pyramidConfigEntry.id)
      : null;
    const pyramidResult = pyramidConfigEntry
      ? evaluatePyramid(
          adviceHistory,
          pyramidConfigEntry.params as PyramidConfig,
          pyramidPrevState ?? undefined,
        )
      : null;
    setPyramidStatus(pyramidResult?.signal ?? null);

    // 「今天該做的事」是這一頁的主角：只要有啟用任一策略就走 routeRecommendation，
    // 由市場狀態收斂成單一行動指示（兩策略同開時避免矛盾建議與重複動用預算；
    // 只開一個時透傳該策略自己的建議），跟「立即檢查」的通知邏輯是同一套判斷
    setRoutedRecommendation(
      gridConfigEntry || pyramidConfigEntry
        ? routeRecommendation(
            adviceHistory,
            gridConfigEntry ? { type: 'grid', params: gridConfigEntry.params } : null,
            pyramidConfigEntry ? (pyramidConfigEntry.params as PyramidConfig) : null,
            pyramidPrevState ?? undefined,
            { momentumConfirmEnabled: watchlistItem.entryConfirmEnabled },
          )
        : null,
    );

    const currentPosition = await getCurrentPosition(db, watchlistId);
    setPosition(currentPosition);

    // 金字塔的 currentTier 是「假設使用者照建議操作」推進出來的，跟交易紀錄算出的
    // 實際持倉是兩條沒有互相核對的線；這裡只讀出落差顯示提醒，不會反過來改寫
    // pyramid_state（見 pyramid-reconciliation.ts 的說明）
    setReconciliation(
      pyramidConfigEntry && pyramidResult
        ? reconcilePosition(
            pyramidConfigEntry.params as PyramidConfig,
            pyramidResult.nextState,
            currentPosition,
          )
        : null,
    );

    const currentPrice =
      currentPriceInfo?.price ??
      (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].close : null);
    setAdvicePrice(currentPrice);

    // 金字塔市場狀態可信時，出場提醒改用同一套棘輪停損動態判斷，不再只看固定 %，
    // 理由與 recommendation-router 的路由邏輯一致：詳見 exit-advisor.ts 的說明
    const exitRegimeContext: ExitRegimeContext | undefined = pyramidResult
      ? {
          state: pyramidResult.signal.state,
          stopPrice: pyramidResult.signal.stopPrice,
          dataSufficient: pyramidResult.signal.action !== 'insufficient_data',
        }
      : undefined;
    setExitAdvice(
      currentPosition && currentPrice !== null
        ? adviseExit(
            currentPosition,
            currentPrice,
            {
              takeProfitPercent: watchlistItem.takeProfitPercent ?? undefined,
              stopLossPercent: watchlistItem.stopLossPercent ?? undefined,
            },
            exitRegimeContext,
          )
        : null,
    );

    setTrades(await getTrades(db, watchlistId));
    setNotifications(await getNotificationHistory(db, watchlistId));
  }, [watchlistId, navigation]);

  useFocusEffect(
    useCallback(() => {
      reload().catch((err) => {
        Alert.alert(
          strings.stockDetail.loadFailedTitle,
          err instanceof Error ? err.message : String(err),
        );
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
      Alert.alert(
        strings.stockDetail.tradeFailedTitle,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSavingTrade(false);
    }
  };

  // 「今天該做的事」建議的股數/價格，換算成下方交易紀錄表單的預填值；只在有明確
  // 可執行動作（進場/加碼/出場）且有目前價格時才提供，純顯示用途的建議不會有這個按鈕
  const tradeSuggestion =
    routedRecommendation && advicePrice !== null
      ? suggestTradeInputs(routedRecommendation, advicePrice, position)
      : null;

  const handlePrefillTrade = (): void => {
    if (!tradeSuggestion) return;
    setTradeSide(tradeSuggestion.side);
    setTradePrice(tradeSuggestion.price);
    setTradeQuantity(tradeSuggestion.quantity);
    setTradeNote('');
    scrollRef.current?.scrollTo({
      y: Math.max(0, tradeSectionOffsetRef.current - spacing.lg),
      animated: true,
    });
    Alert.alert(
      strings.stockDetail.prefillTradeDoneTitle,
      strings.stockDetail.prefillTradeDoneMessage,
    );
  };

  const handleTradeSectionLayout = (event: LayoutChangeEvent): void => {
    tradeSectionOffsetRef.current = event.nativeEvent.layout.y;
  };

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={typography.body}>{strings.common.loading}</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      <Section title={strings.stockDetail.sectionTodayAction}>
        {routedRecommendation ? (
          <StatusRow
            title={strings.stockDetail.todayActionTitle(
              strings.stockDetail.todayActionLabel[routedRecommendation.action],
              routedRecommendation.tierIndex,
              routedRecommendation.amount,
            )}
            subtitle={routedRecommendation.reason}
          />
        ) : (
          <StatusRow
            title={strings.stockDetail.noStrategyTitle}
            subtitle={strings.stockDetail.noStrategySubtitle}
          />
        )}
        {tradeSuggestion && (
          <View style={styles.prefillButtonWrap}>
            <PrimaryButton
              title={strings.stockDetail.prefillTradeButton}
              onPress={handlePrefillTrade}
            />
          </View>
        )}
      </Section>

      {reconciliation && (
        <Section title={strings.stockDetail.sectionReconciliation}>
          <StatusRow
            title={strings.stockDetail.reconciliationStatus[reconciliation.status]}
            subtitle={reconciliation.reason}
          />
        </Section>
      )}

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

      {(gridAdvice || pyramidStatus) && (
        <Section title={strings.stockDetail.sectionStrategyStatus}>
          {gridAdvice && (
            <StatusRow
              title={`${strings.stockDetail.strategyNameGrid}｜${strings.stockDetail.entryAction[gridAdvice.action]}`}
              subtitle={gridAdvice.reason}
            />
          )}
          {pyramidStatus && (
            <StatusRow
              title={`${strings.stockDetail.strategyNamePyramid}｜${strings.stockDetail.pyramidStateLabel(
                strings.stockDetail.pyramidMarketState[pyramidStatus.state],
                pyramidStatus.tierIndex,
              )}`}
              subtitle={pyramidStatus.reason}
            />
          )}
        </Section>
      )}

      <Section title={strings.stockDetail.sectionPosition}>
        {position ? (
          <View style={styles.pnlCard}>
            <Text style={styles.statusSubtitle}>
              {strings.stockDetail.positionSummary(position.quantity, position.avgCost.toFixed(2))}
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

      <View onLayout={handleTradeSectionLayout}>
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
      </View>
      <View style={styles.primaryButtonWrap}>
        <PrimaryButton
          title={
            tradeSide === 'buy'
              ? strings.stockDetail.addBuyRecord
              : strings.stockDetail.addSellRecord
          }
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
            <StatusRow
              key={n.id}
              title={
                n.strategyType === 'grid'
                  ? strings.stockDetail.strategyNameGrid
                  : n.strategyType === 'pyramid'
                    ? strings.stockDetail.strategyNamePyramid
                    : n.strategyType
              }
              subtitle={`${n.sentAt}　${n.signalKey}`}
            />
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
  prefillButtonWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
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
