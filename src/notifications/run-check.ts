import type { SQLiteDatabase } from 'expo-sqlite';

import { getPriceHistory } from '../db/price-history-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../db/watchlist-repo';
import { evaluateStrategy } from '../strategy-engine/engine';
import type { PricePoint, StrategySignal } from '../strategy-engine/types';
import { notifyIfNew } from './local-notification';

export interface CheckResultItem {
  stockCode: string;
  stockName: string;
  strategyConfigId: number;
  strategyType: string;
  signal: StrategySignal;
  notified: boolean;
  notifyError?: string;
}

function buildSignalKey(
  strategyType: string,
  signal: StrategySignal,
  history: PricePoint[],
): string {
  const latestDate = history.length > 0 ? history[history.length - 1].date : 'no-data';
  if (strategyType === 'grid' && signal.tierIndex !== undefined) {
    return `grid:tier${signal.tierIndex}:${latestDate}`;
  }
  return `${strategyType}:triggered:${latestDate}`;
}

/**
 * 讀 watchlist -> 對每檔股票的每個啟用策略呼叫 engine.ts -> 有觸發就寫
 * notification_log 並發本機通知。Phase 4 的背景任務會重用這個函式。
 */
export async function checkWatchlistAndNotify(db: SQLiteDatabase): Promise<CheckResultItem[]> {
  const watchlist = await getWatchlist(db);
  const results: CheckResultItem[] = [];

  for (const item of watchlist) {
    const configs = await getEnabledStrategyConfigs(db, item.id);
    const history = await getPriceHistory(db, item.stockCode);

    for (const config of configs) {
      const signal = evaluateStrategy(history, { type: config.type, params: config.params });

      let notified = false;
      let notifyError: string | undefined;
      if (signal.triggered) {
        const signalKey = buildSignalKey(config.type, signal, history);
        try {
          notified = await notifyIfNew(db, {
            watchlistId: item.id,
            strategyConfigId: config.id,
            signalKey,
            title: `${item.stockCode} ${item.stockName}`,
            body: signal.reason,
          });
        } catch (err) {
          // 單一訊號發送失敗（例如系統通知一時失敗）不該讓其他股票/策略的檢查也被中斷
          notifyError = err instanceof Error ? err.message : String(err);
        }
      }

      results.push({
        stockCode: item.stockCode,
        stockName: item.stockName,
        strategyConfigId: config.id,
        strategyType: config.type,
        signal,
        notified,
        ...(notifyError !== undefined ? { notifyError } : {}),
      });
    }
  }

  return results;
}
