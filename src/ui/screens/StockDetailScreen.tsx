import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
import type { GridStrategyConfig } from '../../strategy-engine/grid-strategy';
import type { Position } from '../../strategy-engine/pnl';
import { classifyTrend, type TrendClassification } from '../../strategy-engine/trend-classifier';
import type { PricePoint, StrategySignal } from '../../strategy-engine/types';
import PriceLineChart from '../components/PriceLineChart';
import type { RootStackParamList } from '../navigation/types';

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

export default function StockDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { watchlistId } = route.params;
  const [item, setItem] = useState<WatchlistItem | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [statuses, setStatuses] = useState<StrategyStatus[]>([]);
  const [notifications, setNotifications] = useState<NotificationHistoryEntry[]>([]);
  const [trend, setTrend] = useState<TrendClassification | null>(null);
  const [entryAdvice, setEntryAdvice] = useState<EntryAdvice | null>(null);
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
    setHistory(priceHistory);

    const configs = await getEnabledStrategyConfigs(db, watchlistId);
    setStatuses(
      configs.map((config) => ({
        type: config.type,
        signal: evaluateStrategy(priceHistory, { type: config.type, params: config.params }),
      })),
    );

    setTrend(classifyTrend(priceHistory));

    const gridConfig = configs.find((c) => c.type === 'grid');
    setEntryAdvice(
      gridConfig ? adviseEntry(priceHistory, gridConfig.params as GridStrategyConfig) : null,
    );

    const currentPosition = await getCurrentPosition(db, watchlistId);
    setPosition(currentPosition);
    const currentPrice =
      priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].close : null;
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
      void reload();
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
      <View style={styles.container}>
        <Text>載入中...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>價格走勢</Text>
      <PriceLineChart history={history} />

      <Text style={styles.sectionTitle}>目前趨勢</Text>
      {trend && (
        <View style={styles.statusRow}>
          <Text style={styles.statusType}>{TREND_LABEL[trend.face]}</Text>
          <Text style={styles.statusReason}>{trend.reason}</Text>
        </View>
      )}

      {entryAdvice && (
        <>
          <Text style={styles.sectionTitle}>進場建議</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusType}>{ENTRY_ACTION_LABEL[entryAdvice.action]}</Text>
            <Text style={styles.statusReason}>{entryAdvice.reason}</Text>
          </View>
        </>
      )}

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

      <Text style={styles.sectionTitle}>持倉與損益</Text>
      {position ? (
        <View style={styles.statusRow}>
          <Text style={styles.statusReason}>
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
              <Text style={styles.statusType}>{EXIT_ACTION_LABEL[exitAdvice.action]}</Text>
              <Text style={styles.statusReason}>{exitAdvice.reason}</Text>
            </>
          )}
        </View>
      ) : (
        <Text style={styles.emptyText}>目前沒有持倉</Text>
      )}

      <Text style={styles.sectionTitle}>記錄交易</Text>
      <View style={styles.switchRow}>
        <Button
          title={tradeSide === 'buy' ? '● 買入' : '○ 買入'}
          onPress={() => setTradeSide('buy')}
        />
        <Button
          title={tradeSide === 'sell' ? '● 賣出' : '○ 賣出'}
          onPress={() => setTradeSide('sell')}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="成交價"
        value={tradePrice}
        onChangeText={setTradePrice}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="股數"
        value={tradeQuantity}
        onChangeText={setTradeQuantity}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="備註（選填）"
        value={tradeNote}
        onChangeText={setTradeNote}
      />
      <Button
        title={savingTrade ? '記錄中...' : `新增${tradeSide === 'buy' ? '買入' : '賣出'}記錄`}
        onPress={handleAddTrade}
        disabled={savingTrade}
      />

      <Text style={styles.sectionTitle}>交易紀錄</Text>
      {trades.length === 0 && <Text style={styles.emptyText}>還沒有任何交易記錄</Text>}
      {[...trades].reverse().map((t) => (
        <View key={t.id} style={styles.historyRow}>
          <Text style={styles.historyText}>
            {t.tradedAt} [{t.side === 'buy' ? '買入' : '賣出'}] {t.quantity} 股 @ {t.price}
            {t.note ? `（${t.note}）` : ''}
          </Text>
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  pnlText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 4,
  },
  pnlPositive: {
    color: '#0a7d2c',
  },
  pnlNegative: {
    color: '#c00',
  },
});
