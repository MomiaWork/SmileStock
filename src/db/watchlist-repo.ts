import type { SQLiteDatabase } from 'expo-sqlite';

import { getMaxWatchlistSize } from './settings-repo';
import type { StrategyType } from '../strategy-engine/engine';

/**
 * strategy_config.type 實際可存的值比 evaluateStrategy 分派用的 StrategyType 多一種：
 * 'pyramid' 是有狀態策略，不走 evaluateStrategy（見 engine.ts 開頭註解），但一樣存在
 * 同一張 strategy_config 表裡，所以這裡的型別要單獨加，不能直接沿用 StrategyType。
 */
export type PersistedStrategyType = StrategyType | 'pyramid';

export interface WatchlistItem {
  id: number;
  stockCode: string;
  stockName: string;
  budget: number;
  priceCheckIntervalSec: number | null;
  takeProfitPercent: number | null;
  stopLossPercent: number | null;
  /** 進場確認濾網總開關：開啟時 adviseEntry 除了看趨勢止穩，還會多確認一次近期動能 */
  entryConfirmEnabled: boolean;
}

export interface StrategyConfigRow {
  id: number;
  watchlistId: number;
  type: PersistedStrategyType;
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
  entryConfirmEnabled?: boolean;
}

export interface NewStrategyConfig {
  watchlistId: number;
  type: PersistedStrategyType;
  params: unknown;
  enabled?: boolean;
}

export async function addWatchlistItem(
  db: SQLiteDatabase,
  item: NewWatchlistItem,
): Promise<number> {
  const [current, maxSize] = await Promise.all([getWatchlist(db), getMaxWatchlistSize(db)]);
  if (current.length >= maxSize) {
    throw new Error(`watchlist-repo: 最多只能監控 ${maxSize} 檔標的`);
  }

  const result = await db.runAsync(
    `INSERT INTO watchlist (stock_code, stock_name, budget, price_check_interval_sec, take_profit_percent, stop_loss_percent, entry_confirm_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      item.stockCode,
      item.stockName,
      item.budget,
      item.priceCheckIntervalSec ?? null,
      item.takeProfitPercent ?? null,
      item.stopLossPercent ?? null,
      item.entryConfirmEnabled ? 1 : 0,
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
                          take_profit_percent = ?, stop_loss_percent = ?, entry_confirm_enabled = ?
     WHERE id = ?`,
    [
      item.stockCode,
      item.stockName,
      item.budget,
      item.priceCheckIntervalSec ?? null,
      item.takeProfitPercent ?? null,
      item.stopLossPercent ?? null,
      item.entryConfirmEnabled ? 1 : 0,
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
    entry_confirm_enabled: number;
  }>(
    `SELECT id, stock_code, stock_name, budget, price_check_interval_sec, take_profit_percent, stop_loss_percent, entry_confirm_enabled
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
    entryConfirmEnabled: row.entry_confirm_enabled === 1,
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
    entry_confirm_enabled: number;
  }>(
    `SELECT id, stock_code, stock_name, budget, price_check_interval_sec, take_profit_percent, stop_loss_percent, entry_confirm_enabled
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
    entryConfirmEnabled: row.entry_confirm_enabled === 1,
  }));
}

function mapStrategyConfigRow(row: {
  id: number;
  watchlist_id: number;
  type: PersistedStrategyType;
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
    type: PersistedStrategyType;
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
    type: PersistedStrategyType;
    params: string;
    enabled: number;
  }>(`SELECT id, watchlist_id, type, params, enabled FROM strategy_config WHERE watchlist_id = ?`, [
    watchlistId,
  ]);

  return rows.map(mapStrategyConfigRow);
}

/**
 * 編輯標的時用「先刪除該標的所有策略設定、再依表單重新新增」的方式覆蓋，
 * 避免處理新增/更新/刪除三種情況的複雜比對邏輯。
 *
 * 注意：刪除 strategy_config 列會透過 ON DELETE CASCADE 一併刪掉對應的 pyramid_state，
 * 新插入的列拿到新的 id，等於金字塔加碼的狀態機每次編輯（哪怕只是改查價間隔這種
 * 無關欄位）都會被重置回初始狀態。這是已知的限制，不在這次改動範圍內處理——
 * 要避免誤觸，UI 層應該在使用者編輯已啟用金字塔加碼的標的時明確提示。
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
