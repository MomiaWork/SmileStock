import type { SQLiteDatabase } from 'expo-sqlite';

import { getCurrentPrices, mergeLivePriceIntoHistory } from '../data-fetch/current-price';
import { getPriceHistory } from '../db/price-history-repo';
import { getPyramidState, savePyramidState } from '../db/pyramid-state-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../db/watchlist-repo';
import type { PyramidConfig } from '../strategy-engine/pyramid-state-machine';
import {
  routeRecommendation,
  type RoutedRecommendation,
} from '../strategy-engine/recommendation-router';
import type { PricePoint } from '../strategy-engine/types';
import { notifyIfNew } from './local-notification';

/**
 * 每檔標的一筆檢查結果。策略層面「聽網格還是聽金字塔」已經由 routeRecommendation
 * 在這裡收斂成單一建議，呼叫端（清單頁的立即檢查、背景任務）只需要知道每檔標的
 * 最後的建議與是否發了通知，不用再理解個別策略的訊號形狀。
 */
export interface CheckResultItem {
  stockCode: string;
  stockName: string;
  /** 這次建議來源策略的 strategy_config id；沒有啟用任何策略時為 null */
  strategyConfigId: number | null;
  /** 路由後的單一建議；沒有啟用任何策略時為 null */
  recommendation: RoutedRecommendation | null;
  notified: boolean;
  notifyError?: string;
}

const ACTION_EMOJI: Record<string, string> = {
  enter: '🟢',
  add: '🟢',
  exit: '🔴',
  wait: '🟡',
};

function buildSignalKey(rec: RoutedRecommendation, history: PricePoint[]): string {
  const latestDate = history.length > 0 ? history[history.length - 1].date : 'no-data';
  const tierPart = rec.tierIndex !== undefined ? `:tier${rec.tierIndex}` : '';
  return `${rec.source}:${rec.action}${tierPart}:${latestDate}`;
}

/**
 * 是否值得打擾使用者：enter/add/exit 是明確要採取行動的時刻；wait 只有在
 * 「網格檔位已經觸發、只是趨勢還沒確認止穩」（tierIndex 有值）時通知——到價本身
 * 是使用者關心的事件。純粹的觀望（下跌趨勢不進場）、凍結、續抱、無訊號都只是
 * 狀態展示，每天通知只會變成噪音。
 */
function shouldNotify(rec: RoutedRecommendation): boolean {
  if (rec.action === 'enter' || rec.action === 'add' || rec.action === 'exit') return true;
  return rec.action === 'wait' && rec.tierIndex !== undefined;
}

/**
 * 讀 watchlist -> 對每檔標的把啟用中的網格/金字塔設定交給 routeRecommendation 收斂成
 * 單一建議 -> 值得行動的建議寫 notification_log 並發本機通知。Phase 4 的背景任務會
 * 重用這個函式。
 *
 * 同一檔標的即使同時啟用網格與金字塔，也只會產生一則通知——跟個股詳情頁顯示的
 * 「今天該做的事」是同一套路由邏輯，通知說買、畫面說凍結這種矛盾不會發生。
 *
 * 策略判斷依 price_history 併入盤中最新報價後的結果，不能只看 price_history 最新一筆
 * （可能是前一交易日，或今天背景同步還沒跑過），否則觸發通知會晚於價格實際到價的時間。
 *
 * 金字塔加碼是有狀態策略：routeRecommendation 內部評估後把推進的新狀態放在
 * pyramidNextState 回傳，這裡負責存回 pyramid_state——不管這次有沒有觸發訊號都要存，
 * 不存的話下次又會從初始狀態重算，狀態機就失去意義。
 *
 * 舊版曾允許 rsi/ma_cross 當獨立策略，這類設定列可能仍留在 DB 裡；它們的角色已經
 * 內化成進場確認濾網（momentum-confirm.ts），這裡直接忽略，不再各自評估與通知。
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
    const gridConfig = configs.find((config) => config.type === 'grid') ?? null;
    const pyramidConfig = configs.find((config) => config.type === 'pyramid') ?? null;

    if (!gridConfig && !pyramidConfig) {
      results.push({
        stockCode: item.stockCode,
        stockName: item.stockName,
        strategyConfigId: null,
        recommendation: null,
        notified: false,
      });
      continue;
    }

    const history = await getPriceHistory(db, item.stockCode);
    const adviceHistory = mergeLivePriceIntoHistory(history, currentPrices[item.stockCode] ?? null);

    const prevState = pyramidConfig ? await getPyramidState(db, pyramidConfig.id) : null;
    const recommendation = routeRecommendation(
      adviceHistory,
      gridConfig ? { type: 'grid', params: gridConfig.params } : null,
      pyramidConfig ? (pyramidConfig.params as PyramidConfig) : null,
      prevState ?? undefined,
      { momentumConfirmEnabled: item.entryConfirmEnabled },
    )!;

    if (pyramidConfig && recommendation.pyramidNextState) {
      await savePyramidState(db, pyramidConfig.id, recommendation.pyramidNextState);
    }

    const sourceConfigId =
      recommendation.source === 'grid' ? gridConfig!.id : pyramidConfig!.id;

    let notified = false;
    let notifyError: string | undefined;
    if (shouldNotify(recommendation)) {
      const signalKey = buildSignalKey(recommendation, adviceHistory);
      try {
        notified = await notifyIfNew(db, {
          watchlistId: item.id,
          strategyConfigId: sourceConfigId,
          signalKey,
          title: `${ACTION_EMOJI[recommendation.action] ?? '🟡'} ${item.stockCode} ${item.stockName}`,
          body: recommendation.reason,
        });
      } catch (err) {
        // 單一訊號發送失敗（例如系統通知一時失敗）不該讓其他標的的檢查也被中斷
        notifyError = err instanceof Error ? err.message : String(err);
      }
    }

    results.push({
      stockCode: item.stockCode,
      stockName: item.stockName,
      strategyConfigId: sourceConfigId,
      recommendation,
      notified,
      ...(notifyError !== undefined ? { notifyError } : {}),
    });
  }

  return results;
}
