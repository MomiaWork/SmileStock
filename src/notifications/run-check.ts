import type { SQLiteDatabase } from 'expo-sqlite';

import { getCurrentPrices, mergeLivePriceIntoHistory } from '../data-fetch/current-price';
import { getPriceHistory } from '../db/price-history-repo';
import { getPyramidState, savePyramidState } from '../db/pyramid-state-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../db/watchlist-repo';
import { adviseEntry, type EntryAdvice } from '../strategy-engine/entry-advisor';
import { evaluateStrategy } from '../strategy-engine/engine';
import {
  evaluatePyramid,
  type PyramidConfig,
  type PyramidSignal,
} from '../strategy-engine/pyramid-state-machine';
import type { PricePoint, StrategySignal } from '../strategy-engine/types';
import { notifyIfNew } from './local-notification';

/**
 * 金字塔加碼是有狀態策略，訊號的意義（加碼/出場）跟網格/RSI/均線交叉的「進場建議」
 * 本質不同（EntryAdvice 只有 enter/wait/no_signal，沒有「出場」的概念），硬塞進同一個
 * signal/advice 形狀只會產生誤導性的資料，改用 discriminated union 分開表示。
 */
export type CheckResultItem =
  | {
      stockCode: string;
      stockName: string;
      strategyConfigId: number;
      strategyType: 'grid' | 'rsi' | 'ma_cross';
      signal: StrategySignal;
      advice: EntryAdvice;
      notified: boolean;
      notifyError?: string;
    }
  | {
      stockCode: string;
      stockName: string;
      strategyConfigId: number;
      strategyType: 'pyramid';
      pyramidSignal: PyramidSignal;
      notified: boolean;
      notifyError?: string;
    };

const ENTRY_ACTION_EMOJI: Record<'enter' | 'wait', string> = {
  enter: '🟢',
  wait: '🟡',
};

const PYRAMID_ACTION_EMOJI: Record<'add' | 'exit', string> = {
  add: '🟢',
  exit: '🔴',
};

function buildSignalKey(strategyType: string, advice: EntryAdvice, history: PricePoint[]): string {
  const latestDate = history.length > 0 ? history[history.length - 1].date : 'no-data';
  const tierPart = advice.tierIndex !== undefined ? `:tier${advice.tierIndex}` : '';
  return `${strategyType}:${advice.action}${tierPart}:${latestDate}`;
}

function buildPyramidSignalKey(signal: PyramidSignal, history: PricePoint[]): string {
  const latestDate = history.length > 0 ? history[history.length - 1].date : 'no-data';
  const tierPart = signal.tierIndex !== undefined ? `:tier${signal.tierIndex}` : '';
  return `pyramid:${signal.action}${tierPart}:${latestDate}`;
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
 *
 * 金字塔加碼（pyramid）不走 evaluateStrategy/adviseEntry——它是有狀態策略，每次都要讀
 * 上一次存的 PyramidState 當 prevState 傳入 evaluatePyramid，算完新狀態要存回去，
 * 不管這次有沒有觸發訊號都要存（不存的話下次又會從初始狀態重算，等於狀態機失去意義）。
 * 只有 action 為 add（加碼）或 exit（出場）才是使用者要採取行動的時刻，才發通知；
 * freeze/hold/insufficient_data 純粹是狀態展示，不用打擾使用者。
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
      if (config.type === 'pyramid') {
        const pyramidConfig = config.params as PyramidConfig;
        const prevState = await getPyramidState(db, config.id);
        const { signal: pyramidSignal, nextState } = evaluatePyramid(
          adviceHistory,
          pyramidConfig,
          prevState ?? undefined,
        );
        await savePyramidState(db, config.id, nextState);

        let notified = false;
        let notifyError: string | undefined;
        if (pyramidSignal.action === 'add' || pyramidSignal.action === 'exit') {
          const signalKey = buildPyramidSignalKey(pyramidSignal, adviceHistory);
          try {
            notified = await notifyIfNew(db, {
              watchlistId: item.id,
              strategyConfigId: config.id,
              signalKey,
              title: `${PYRAMID_ACTION_EMOJI[pyramidSignal.action]} ${item.stockCode} ${item.stockName}`,
              body: pyramidSignal.reason,
            });
          } catch (err) {
            notifyError = err instanceof Error ? err.message : String(err);
          }
        }

        results.push({
          stockCode: item.stockCode,
          stockName: item.stockName,
          strategyConfigId: config.id,
          strategyType: 'pyramid',
          pyramidSignal,
          notified,
          ...(notifyError !== undefined ? { notifyError } : {}),
        });
        continue;
      }

      const strategyConfig = { type: config.type, params: config.params };
      const signal = evaluateStrategy(adviceHistory, strategyConfig);
      const advice = adviseEntry(adviceHistory, strategyConfig, {
        momentumConfirmEnabled: item.entryConfirmEnabled,
      });

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
