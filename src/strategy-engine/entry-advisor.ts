import { evaluateStrategy, type StrategyConfig } from './engine';
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

/**
 * 進場建議：策略本身（網格/RSI/均線交叉）負責「要不要觸發、觸發時投入多少」，
 * trend-classifier 負責「現在是止穩反彈還是還在自由落體」當共用的安全閥門。
 * 只有策略觸發「且」趨勢已確認止穩反彈（笑臉）才建議進場；
 * 策略觸發但趨勢還沒確認（哭臉持續破底、或中性不明朗）一律建議先觀望，
 * 避免買在還沒止跌的下跌途中。三種持久化策略（grid/rsi/ma_cross）共用同一套判斷，
 * 不特別區分「這是不是第一筆投資」——網格策略本來就是每次觸發都要重新檢查趨勢，
 * 不是只管第一筆。
 */
export function adviseEntry(
  history: PricePoint[],
  strategyConfig: StrategyConfig,
  trendConfig?: TrendClassifierConfig,
): EntryAdvice {
  const signal = evaluateStrategy(history, strategyConfig);
  if (!signal.triggered) {
    return { action: 'no_signal', reason: signal.reason };
  }

  const trend = classifyTrend(history, trendConfig);
  if (trend.face !== 'smile') {
    return {
      action: 'wait',
      tierIndex: signal.tierIndex,
      reason: `${signal.reason}，但${trend.reason}，建議先觀望，等止穩反彈訊號再進場`,
    };
  }

  return {
    action: 'enter',
    tierIndex: signal.tierIndex,
    amount: signal.amount,
    reason: `${signal.reason}，且${trend.reason}，建議進場`,
  };
}
