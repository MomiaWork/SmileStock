import type { SQLiteDatabase } from 'expo-sqlite';

import type { StrategyType } from '../strategy-engine/engine';

export interface WatchlistItem {
  id: number;
  stockCode: string;
  stockName: string;
  budget: number;
  priceCheckIntervalSec: number | null;
}

export interface StrategyConfigRow {
  id: number;
  watchlistId: number;
  type: StrategyType;
  params: unknown;
  enabled: boolean;
}

export interface NewWatchlistItem {
  stockCode: string;
  stockName: string;
  budget: number;
  priceCheckIntervalSec?: number | null;
}

export interface NewStrategyConfig {
  watchlistId: number;
  type: StrategyType;
  params: unknown;
  enabled?: boolean;
}

export async function addWatchlistItem(
  db: SQLiteDatabase,
  item: NewWatchlistItem,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO watchlist (stock_code, stock_name, budget, price_check_interval_sec)
     VALUES (?, ?, ?, ?)`,
    [item.stockCode, item.stockName, item.budget, item.priceCheckIntervalSec ?? null],
  );
  return result.lastInsertRowId;
}

export async function addStrategyConfig(
  db: SQLiteDatabase,
  config: NewStrategyConfig,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO strategy_config (watchlist_id, type, params, enabled)
     VALUES (?, ?, ?, ?)`,
    [
      config.watchlistId,
      config.type,
      JSON.stringify(config.params),
      config.enabled === false ? 0 : 1,
    ],
  );
  return result.lastInsertRowId;
}

export async function getWatchlist(db: SQLiteDatabase): Promise<WatchlistItem[]> {
  const rows = await db.getAllAsync<{
    id: number;
    stock_code: string;
    stock_name: string;
    budget: number;
    price_check_interval_sec: number | null;
  }>(
    `SELECT id, stock_code, stock_name, budget, price_check_interval_sec FROM watchlist ORDER BY id ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    budget: row.budget,
    priceCheckIntervalSec: row.price_check_interval_sec,
  }));
}

export async function getEnabledStrategyConfigs(
  db: SQLiteDatabase,
  watchlistId: number,
): Promise<StrategyConfigRow[]> {
  const rows = await db.getAllAsync<{
    id: number;
    watchlist_id: number;
    type: StrategyType;
    params: string;
    enabled: number;
  }>(
    `SELECT id, watchlist_id, type, params, enabled FROM strategy_config
     WHERE watchlist_id = ? AND enabled = 1`,
    [watchlistId],
  );

  return rows.map((row) => ({
    id: row.id,
    watchlistId: row.watchlist_id,
    type: row.type,
    params: JSON.parse(row.params) as unknown,
    enabled: row.enabled === 1,
  }));
}
