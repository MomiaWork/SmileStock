import { evaluateStrategy, type StrategyConfig } from './engine';
import { checkMomentumConfirm } from './momentum-confirm';
import { classifyTrend, type TrendClassifierConfig } from './trend-classifier';
import type { PricePoint } from './types';

export type EntryAction = 'enter' | 'wait' | 'no_signal';

export interface EntryAdvice {
  action: EntryAction;
  tierIndex?: number;
  /** 建議投入金額，依策略觸發時算出的金額透傳（目前僅網格策略提供），只在 action 為 enter 時有值 */
  amount?: number;
  reason: string;
}

export interface EntryAdvisorOptions {
  trendConfig?: TrendClassifierConfig;
  /** 開啟後，趨勢確認止穩後還要再通過動能確認濾網（見 momentum-confirm.ts）才建議進場 */
  momentumConfirmEnabled?: boolean;
}

/**
 * 進場建議：策略本身（網格/RSI/均線交叉）負責「要不要觸發、觸發時投入多少」。
 *
 * 網格與 RSI 是「接刀」型策略（跌深後承接），trend-classifier 的止穩反彈（笑臉）
 * 濾網在這兩者身上是必要的安全閥——策略觸發但趨勢還在自由落體（哭臉）或還沒
 * 確認止穩（中性）時一律建議先觀望，避免買在下跌途中。
 *
 * 均線交叉是「順勢」型策略：黃金交叉本身就是「轉強」訊號，不套用止穩反彈濾網——
 * 那個濾網要求「先創近期新低、再連續收高」，套到順勢策略上等於要求一檔早已穩定
 * 上漲、根本沒有再創新低的股票先跌破前低才能進場，會讓黃金交叉永遠等不到進場
 * 時機。均線交叉觸發即建議進場，不再額外檢查趨勢或動能濾網。
 *
 * `momentumConfirmEnabled` 只影響網格/RSI：開啟後，趨勢確認之後還要再過動能確認
 * 濾網才算 enter，沒過就跟趨勢未確認一樣先建議觀望；關閉（預設）時行為跟這個
 * 濾網完全無關。
 */
export function adviseEntry(
  history: PricePoint[],
  strategyConfig: StrategyConfig,
  options?: EntryAdvisorOptions,
): EntryAdvice {
  const signal = evaluateStrategy(history, strategyConfig);
  if (!signal.triggered) {
    return { action: 'no_signal', reason: signal.reason };
  }

  if (strategyConfig.type === 'ma_cross') {
    return {
      action: 'enter',
      tierIndex: signal.tierIndex,
      amount: signal.amount,
      reason: `${signal.reason}，建議進場`,
    };
  }

  const trend = classifyTrend(history, options?.trendConfig);
  if (trend.face !== 'smile') {
    return {
      action: 'wait',
      tierIndex: signal.tierIndex,
      reason: `${signal.reason}，但${trend.reason}，建議先觀望，等止穩反彈訊號再進場`,
    };
  }

  if (options?.momentumConfirmEnabled) {
    const momentum = checkMomentumConfirm(history);
    if (!momentum.confirmed) {
      return {
        action: 'wait',
        tierIndex: signal.tierIndex,
        reason: `${signal.reason}，且${trend.reason}，但${momentum.reason}，建議先觀望`,
      };
    }
  }

  return {
    action: 'enter',
    tierIndex: signal.tierIndex,
    amount: signal.amount,
    reason: `${signal.reason}，且${trend.reason}，建議進場`,
  };
}
