import type { SQLiteDatabase } from 'expo-sqlite';

import type { PricePoint } from '../strategy-engine/types';

export interface PriceHistoryEntry {
  stockCode: string;
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
}

/**
 * 以 (stock_code, date) 為鍵值 upsert，同一天重複寫入不會產生重複資料列。
 */
export async function upsertPriceHistory(
  db: SQLiteDatabase,
  entries: PriceHistoryEntry[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      await db.runAsync(
        `INSERT INTO price_history (stock_code, date, close, high, low, volume)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (stock_code, date)
         DO UPDATE SET close = excluded.close, high = excluded.high,
                        low = excluded.low, volume = excluded.volume`,
        [entry.stockCode, entry.date, entry.close, entry.high, entry.low, entry.volume],
      );
    }
  });
}

export async function getPriceHistory(
  db: SQLiteDatabase,
  stockCode: string,
): Promise<PricePoint[]> {
  const rows = await db.getAllAsync<{
    date: string;
    close: number;
    high: number;
    low: number;
    volume: number;
  }>(
    `SELECT date, close, high, low, volume FROM price_history
     WHERE stock_code = ? ORDER BY date ASC`,
    [stockCode],
  );
  return rows.map((row) => ({
    date: row.date,
    close: row.close,
    high: row.high,
    low: row.low,
    volume: row.volume,
  }));
}

export async function countPriceHistoryRows(
  db: SQLiteDatabase,
  stockCode: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM price_history WHERE stock_code = ?`,
    [stockCode],
  );
  return row?.count ?? 0;
}
