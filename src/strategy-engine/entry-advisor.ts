import { gridStrategy, type GridStrategyConfig } from './grid-strategy';
import { classifyTrend, type TrendClassifierConfig } from './trend-classifier';
import type { PricePoint } from './types';

export type EntryAction = 'enter' | 'wait' | 'no_signal';

export interface EntryAdvice {
  action: EntryAction;
  tierIndex?: number;
  /** 建議投入金額，依網格預算與檔位權重算出，只在 action 為 enter 時提供 */
  amount?: number;
  reason: string;
}

/**
 * 進場建議：網格策略負責「跌到第幾檔、依預算該投入多少」，
 * trend-classifier 負責「現在是止穩反彈還是還在自由落體」當安全閥門。
 * 只有網格觸發「且」趨勢已確認止穩反彈（笑臉）才建議進場；
 * 網格觸發但趨勢還沒確認（哭臉持續破底、或中性不明朗）一律建議先觀望，
 * 避免買在還沒止跌的下跌途中。
 */
export function adviseEntry(
  history: PricePoint[],
  gridConfig: GridStrategyConfig,
  trendConfig?: TrendClassifierConfig,
): EntryAdvice {
  const gridSignal = gridStrategy.evaluate(history, gridConfig);
  if (!gridSignal.triggered) {
    return { action: 'no_signal', reason: gridSignal.reason };
  }

  const trend = classifyTrend(history, trendConfig);
  if (trend.face !== 'smile') {
    return {
      action: 'wait',
      tierIndex: gridSignal.tierIndex,
      reason: `網格已觸發第 ${gridSignal.tierIndex} 檔，但${trend.reason}，建議先觀望，等止穩反彈訊號再進場`,
    };
  }

  return {
    action: 'enter',
    tierIndex: gridSignal.tierIndex,
    amount: gridSignal.amount,
    reason: `網格已觸發第 ${gridSignal.tierIndex} 檔，且${trend.reason}，建議進場，投入約 ${gridSignal.amount?.toFixed(0)} 元`,
  };
}
