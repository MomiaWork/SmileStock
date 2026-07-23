import type { Position } from './pnl';
import type { PyramidConfig, PyramidState } from './pyramid-state-machine';

export type ReconciliationStatus = 'underfunded' | 'overfunded';

export interface ReconciliationMismatch {
  status: ReconciliationStatus;
  expectedCostBasis: number;
  actualCostBasis: number;
  reason: string;
}

/** 持倉成本低於策略記錄應投入金額的比例門檻，低於此比例才視為「可能忘記記錄」 */
const UNDERFUNDED_RATIO = 0.5;
/** 持倉成本高於策略記錄應投入金額的比例門檻，高於此比例才視為「記錄外的額外買進」 */
const OVERFUNDED_RATIO = 1.5;

function cumulativeDeployedAmount(config: PyramidConfig, tier: number): number {
  const weightSum = config.weights.reduce((acc, w) => acc + w, 0);
  let cumWeight = 0;
  for (let i = 0; i <= tier; i += 1) {
    cumWeight += config.weights[i];
  }
  return (config.budget * cumWeight) / weightSum;
}

/**
 * 金字塔狀態機的 currentTier 是「假設使用者照建議執行了每一次加碼」推進出來的，
 * 跟交易紀錄（trade-repo）算出的實際持倉是兩條沒有互相核對的線：使用者照建議買了
 * 卻忘記記一筆，狀態機仍會繼續往下一級推進、下次建議金額還是照全額算；反過來若
 * 使用者根本沒照做，狀態機也不知道。
 *
 * 這裡只做唯讀的落差偵測，不會反過來改寫 PyramidState——實際應該對到哪一級沒有
 * 唯一解（使用者可能分批用不同價格買、或刻意只買一部分），糾正交由使用者自己在
 * 交易紀錄補登或核對，這裡只負責把落差攤在畫面上讓使用者看見，一致時回傳 null。
 *
 * currentTier 為 0（只有起始部位）時不檢查：起始部位是使用者設定「進場價」時自己
 * 認定已經/即將進場的操作，不強制要求先有交易紀錄才能啟用策略。
 */
export function reconcilePosition(
  config: PyramidConfig,
  state: PyramidState,
  actualPosition: Position | null,
): ReconciliationMismatch | null {
  if (state.currentTier <= 0) return null;

  const expectedCostBasis = cumulativeDeployedAmount(config, state.currentTier);
  const actualCostBasis = actualPosition ? actualPosition.avgCost * actualPosition.quantity : 0;

  if (actualCostBasis < expectedCostBasis * UNDERFUNDED_RATIO) {
    return {
      status: 'underfunded',
      expectedCostBasis,
      actualCostBasis,
      reason: `策略記錄已加碼到第 ${state.currentTier} 級，累積應投入約 ${expectedCostBasis.toFixed(0)} 元，但交易紀錄算出的持倉成本只有 ${actualCostBasis.toFixed(0)} 元，可能有加碼忘記記錄，之後的加碼建議金額會失真，請補上交易紀錄`,
    };
  }

  if (actualCostBasis > expectedCostBasis * OVERFUNDED_RATIO) {
    return {
      status: 'overfunded',
      expectedCostBasis,
      actualCostBasis,
      reason: `交易紀錄算出的持倉成本約 ${actualCostBasis.toFixed(0)} 元，超過策略記錄第 ${state.currentTier} 級應投入的約 ${expectedCostBasis.toFixed(0)} 元，可能有記錄之外的額外買進，或策略狀態與實際操作已經不同步`,
    };
  }

  return null;
}
