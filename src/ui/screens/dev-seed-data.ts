import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertPriceHistory } from '../../db/price-history-repo';
import { addStrategyConfig, addWatchlistItem, getWatchlist } from '../../db/watchlist-repo';

export const TRIGGER_STOCK = { code: 'TEST_GRID', name: '測試會觸發' };
export const QUIET_STOCK = { code: 'TEST_RSI', name: '測試不觸發' };

/**
 * Phase 5 正式 UI 完成前，共用於各個 Dev 測試畫面的假資料：
 * 一檔會觸發網格策略、一檔不會觸發 RSI 策略。重複呼叫是安全的（已存在就跳過）。
 */
export async function seedTestData(db: SQLiteDatabase): Promise<void> {
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
}
