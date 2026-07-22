import type { SQLiteDatabase } from 'expo-sqlite';

import { getCurrentPrices, mergeLivePriceIntoHistory } from '../data-fetch/current-price';
import { getPriceHistory } from '../db/price-history-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../db/watchlist-repo';
import { adviseEntry, type EntryAdvice } from '../strategy-engine/entry-advisor';
import { evaluateStrategy } from '../strategy-engine/engine';
import type { PricePoint, StrategySignal } from '../strategy-engine/types';
import { notifyIfNew } from './local-notification';

export interface CheckResultItem {
  stockCode: string;
  stockName: string;
  strategyConfigId: number;
  strategyType: string;
  signal: StrategySignal;
  advice: EntryAdvice;
  notified: boolean;
  notifyError?: string;
}

const ENTRY_ACTION_EMOJI: Record<'enter' | 'wait', string> = {
  enter: '🟢',
  wait: '🟡',
};

function buildSignalKey(
  strategyType: string,
  advice: EntryAdvice,
  history: PricePoint[],
): string {
  const latestDate = history.length > 0 ? history[history.length - 1].date : 'no-data';
  const tierPart = advice.tierIndex !== undefined ? `:tier${advice.tierIndex}` : '';
  return `${strategyType}:${advice.action}${tierPart}:${latestDate}`;
}

/**
 * 讀 watchlist -> 對每檔股票的每個啟用策略呼叫 entry-advisor.ts -> 策略觸發且經過
 * trend-classifier 笑臉/哭臉安全閥判斷後，只要不是「尚未觸發」就寫 notification_log
 * 並發本機通知。Phase 4 的背景任務會重用這個函式。
 *
 * action 為 wait（策略已觸發但趨勢還沒確認止穩反彈）也會推播，只是文案跟 enter
 * 不同——避免新加入、歷史資料還不足以判斷趨勢的股票在確認前完全收不到通知。
 *
 * 策略判斷依 price_history 併入盤中最新報價後的結果，不能只看 price_history 最新一筆
 * （可能是前一交易日，或今天背景同步還沒跑過），否則觸發通知會晚於價格實際到價的時間。
 */
export async function checkWatchlistAndNotify(db: SQLiteDatabase): Promise<CheckResultItem[]> {
  const watchlist = await getWatchlist(db);
  const currentPrices = await getCurrentPrices(
    db,
    watchlist.map((item) => item.stockCode),
  );
  const results: CheckResultItem[] = [];

  for (const item of watchlist) {
    const configs = await getEnabledStrategyConfigs(db, item.id);
    const history = await getPriceHistory(db, item.stockCode);
    const adviceHistory = mergeLivePriceIntoHistory(history, currentPrices[item.stockCode] ?? null);

    for (const config of configs) {
      const strategyConfig = { type: config.type, params: config.params };
      const signal = evaluateStrategy(adviceHistory, strategyConfig);
      const advice = adviseEntry(adviceHistory, strategyConfig);

      let notified = false;
      let notifyError: string | undefined;
      if (advice.action !== 'no_signal') {
        const signalKey = buildSignalKey(config.type, advice, adviceHistory);
        try {
          notified = await notifyIfNew(db, {
            watchlistId: item.id,
            strategyConfigId: config.id,
            signalKey,
            title: `${ENTRY_ACTION_EMOJI[advice.action]} ${item.stockCode} ${item.stockName}`,
            body: advice.reason,
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
        advice,
        notified,
        ...(notifyError !== undefined ? { notifyError } : {}),
      });
    }
  }

  return results;
}
