import type { SQLiteDatabase } from 'expo-sqlite';

import type { StrategyType } from '../strategy-engine/engine';

export interface WatchlistItem {
  id: number;
  stockCode: string;
  stockName: string;
  budget: number;
  priceCheckIntervalSec: number | null;
  takeProfitPercent: number | null;
  stopLossPercent: number | null;
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
  takeProfitPercent?: number | null;
  stopLossPercent?: number | null;
}

export interface NewStrategyConfig {
  watchlistId: number;
  type: StrategyType;
  params: unknown;
  enabled?: boolean;
}

export const MAX_WATCHLIST_SIZE = 5;

export async function addWatchlistItem(
  db: SQLiteDatabase,
  item: NewWatchlistItem,
): Promise<number> {
  const current = await getWatchlist(db);
  if (current.length >= MAX_WATCHLIST_SIZE) {
    throw new Error(`watchlist-repo: 最多只能監控 ${MAX_WATCHLIST_SIZE} 檔股票`);
  }

  const result = await db.runAsync(
    `INSERT INTO watchlist (stock_code, stock_name, budget, price_check_interval_sec, take_profit_percent, stop_loss_percent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      item.stockCode,
      item.stockName,
      item.budget,
      item.priceCheckIntervalSec ?? null,
      item.takeProfitPercent ?? null,
      item.stopLossPercent ?? null,
    ],
  );
  return result.lastInsertRowId;
}

export async function updateWatchlistItem(
  db: SQLiteDatabase,
  id: number,
  item: NewWatchlistItem,
): Promise<void> {
  await db.runAsync(
    `UPDATE watchlist SET stock_code = ?, stock_name = ?, budget = ?, price_check_interval_sec = ?,
                          take_profit_percent = ?, stop_loss_percent = ?
     WHERE id = ?`,
    [
      item.stockCode,
      item.stockName,
      item.budget,
      item.priceCheckIntervalSec ?? null,
      item.takeProfitPercent ?? null,
      item.stopLossPercent ?? null,
      id,
    ],
  );
}

export async function deleteWatchlistItem(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM watchlist WHERE id = ?`, [id]);
}

export async function getWatchlistItem(
  db: SQLiteDatabase,
  id: number,
): Promise<WatchlistItem | null> {
  const row = await db.getFirstAsync<{
    id: number;
    stock_code: string;
    stock_name: string;
    budget: number;
    price_check_interval_sec: number | null;
    take_profit_percent: number | null;
    stop_loss_percent: number | null;
  }>(
    `SELECT id, stock_code, stock_name, budget, price_check_interval_sec, take_profit_percent, stop_loss_percent
     FROM watchlist WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  return {
    id: row.id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    budget: row.budget,
    priceCheckIntervalSec: row.price_check_interval_sec,
    takeProfitPercent: row.take_profit_percent,
    stopLossPercent: row.stop_loss_percent,
  };
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
    take_profit_percent: number | null;
    stop_loss_percent: number | null;
  }>(
    `SELECT id, stock_code, stock_name, budget, price_check_interval_sec, take_profit_percent, stop_loss_percent
     FROM watchlist ORDER BY id ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    budget: row.budget,
    priceCheckIntervalSec: row.price_check_interval_sec,
    takeProfitPercent: row.take_profit_percent,
    stopLossPercent: row.stop_loss_percent,
  }));
}

function mapStrategyConfigRow(row: {
  id: number;
  watchlist_id: number;
  type: StrategyType;
  params: string;
  enabled: number;
}): StrategyConfigRow {
  return {
    id: row.id,
    watchlistId: row.watchlist_id,
    type: row.type,
    params: JSON.parse(row.params) as unknown,
    enabled: row.enabled === 1,
  };
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

  return rows.map(mapStrategyConfigRow);
}

export async function getAllStrategyConfigs(
  db: SQLiteDatabase,
  watchlistId: number,
): Promise<StrategyConfigRow[]> {
  const rows = await db.getAllAsync<{
    id: number;
    watchlist_id: number;
    type: StrategyType;
    params: string;
    enabled: number;
  }>(`SELECT id, watchlist_id, type, params, enabled FROM strategy_config WHERE watchlist_id = ?`, [
    watchlistId,
  ]);

  return rows.map(mapStrategyConfigRow);
}

/**
 * 編輯股票時用「先刪除該股票所有策略設定、再依表單重新新增」的方式覆蓋，
 * 避免處理新增/更新/刪除三種情況的複雜比對邏輯。
 */
export async function replaceStrategyConfigs(
  db: SQLiteDatabase,
  watchlistId: number,
  configs: Omit<NewStrategyConfig, 'watchlistId'>[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM strategy_config WHERE watchlist_id = ?`, [watchlistId]);
    for (const config of configs) {
      await db.runAsync(
        `INSERT INTO strategy_config (watchlist_id, type, params, enabled)
         VALUES (?, ?, ?, ?)`,
        [watchlistId, config.type, JSON.stringify(config.params), config.enabled === false ? 0 : 1],
      );
    }
  });
}
