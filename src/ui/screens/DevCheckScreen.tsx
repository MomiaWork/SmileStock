import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { upsertPriceHistory } from '../../db/price-history-repo';
import { getDb } from '../../db/schema';
import { addStrategyConfig, addWatchlistItem, getWatchlist } from '../../db/watchlist-repo';
import { requestNotificationPermission } from '../../notifications/local-notification';
import { checkWatchlistAndNotify } from '../../notifications/run-check';

const TRIGGER_STOCK = { code: 'TEST_GRID', name: '測試會觸發' };
const QUIET_STOCK = { code: 'TEST_RSI', name: '測試不觸發' };

/**
 * Phase 3 手動驗證用畫面：建立假資料 -> 按「立即檢查」-> 應觸發的跳通知、
 * 不應觸發的不跳、重複按不會對同一訊號發第二次通知。
 * Phase 5 會用正式的股票清單頁 + 詳情頁取代這個畫面。
 */
export default function DevCheckScreen(): React.JSX.Element {
  const [log, setLog] = useState<string>('尚未執行');

  const seedTestData = async (): Promise<void> => {
    const db = await getDb();
    const existing = await getWatchlist(db);
    const existingCodes = new Set(existing.map((w) => w.stockCode));

    if (!existingCodes.has(TRIGGER_STOCK.code)) {
      const watchlistId = await addWatchlistItem(db, {
        stockCode: TRIGGER_STOCK.code,
        stockName: TRIGGER_STOCK.name,
        budget: 10000,
      });
      await addStrategyConfig(db, {
        watchlistId,
        type: 'grid',
        params: { anchorPrice: 100, budget: 10000, spacingPercent: 5, tierCount: 5 },
      });
      await upsertPriceHistory(db, [
        {
          stockCode: TRIGGER_STOCK.code,
          date: '2026-07-20',
          close: 90,
          high: 91,
          low: 89,
          volume: 1000,
        },
      ]);
    }

    if (!existingCodes.has(QUIET_STOCK.code)) {
      const watchlistId = await addWatchlistItem(db, {
        stockCode: QUIET_STOCK.code,
        stockName: QUIET_STOCK.name,
        budget: 10000,
      });
      await addStrategyConfig(db, {
        watchlistId,
        type: 'rsi',
        params: { period: 4, threshold: 30 },
      });
      await upsertPriceHistory(
        db,
        [100, 101, 102, 103, 104].map((close, i) => ({
          stockCode: QUIET_STOCK.code,
          date: `2026-07-${16 + i}`,
          close,
          high: close + 1,
          low: close - 1,
          volume: 1000,
        })),
      );
    }

    setLog('測試資料已建立（或已存在）。可以按「立即檢查」了。');
  };

  const runCheck = async (): Promise<void> => {
    setLog('執行中...');
    const granted = await requestNotificationPermission();
    const db = await getDb();
    const results = await checkWatchlistAndNotify(db);

    const lines = [`通知權限：${granted ? '已授權' : '未授權（不會顯示通知，但仍會寫 log）'}`, ''];
    for (const r of results) {
      lines.push(
        `${r.stockCode} ${r.stockName} [${r.strategyType}] triggered=${r.signal.triggered} notified=${r.notified}`,
      );
      lines.push(`  reason: ${r.signal.reason}`);
    }
    setLog(lines.join('\n'));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phase 3 測試：策略檢查 + 通知</Text>
      <Button title="1. 建立測試資料" onPress={seedTestData} />
      <View style={styles.spacer} />
      <Button title="2. 立即檢查" onPress={runCheck} />
      <ScrollView style={styles.logBox}>
        <Text style={styles.logText}>{log}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  spacer: {
    height: 8,
  },
  logBox: {
    marginTop: 16,
    flex: 1,
  },
  logText: {
    fontFamily: 'Courier',
    fontSize: 12,
  },
});
