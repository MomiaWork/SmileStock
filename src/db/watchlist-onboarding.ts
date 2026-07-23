import type { SQLiteDatabase } from 'expo-sqlite';

import { backfillPriceHistory } from '../data-fetch/price-history-sync';
import type { GridStrategyConfig } from '../strategy-engine/grid-strategy';
import { minRequiredBars, type PyramidConfig } from '../strategy-engine/pyramid-state-machine';
import {
  addWatchlistItem,
  replaceStrategyConfigs,
  type NewWatchlistItem,
  type PersistedStrategyType,
} from './watchlist-repo';

export interface NewWatchlistWithStrategies {
  item: NewWatchlistItem;
  grid?: GridStrategyConfig;
  pyramid?: PyramidConfig;
}

export interface AddWatchlistItemResult {
  id: number;
  /** 回補歷史價格失敗不擋新增標的（之後每日同步仍會逐筆累積資料），但呼叫端可能想告知使用者 */
  backfillError: Error | null;
}

/**
 * 新增標的＋套用策略設定的共用流程：寫入 watchlist、回補歷史價格（金字塔加碼需要的天數比
 * 網格/RSI/均線交叉多，見 minRequiredBars）、寫入 strategy_config。「策略建議」快速套用
 * 與新增表單手動送出都走這條路徑，避免兩處邏輯各自維護、行為漂移。
 */
export async function addWatchlistItemWithStrategies(
  db: SQLiteDatabase,
  input: NewWatchlistWithStrategies,
): Promise<AddWatchlistItemResult> {
  const id = await addWatchlistItem(db, input.item);

  let backfillError: Error | null = null;
  const minTradingDays = input.pyramid ? Math.max(21, minRequiredBars(input.pyramid)) : undefined;
  try {
    await backfillPriceHistory(db, input.item.stockCode, minTradingDays);
  } catch (err) {
    backfillError = err instanceof Error ? err : new Error(String(err));
  }

  const configs: { type: PersistedStrategyType; params: unknown; enabled: boolean }[] = [];
  if (input.grid) {
    configs.push({ type: 'grid', enabled: true, params: input.grid });
  }
  if (input.pyramid) {
    configs.push({ type: 'pyramid', enabled: true, params: input.pyramid });
  }
  await replaceStrategyConfigs(db, id, configs);

  return { id, backfillError };
}
