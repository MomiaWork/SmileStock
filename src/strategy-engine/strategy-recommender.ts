import { runGridBacktest, type BacktestParams, type BacktestResult } from './backtest';
import type { PricePoint } from './types';

export interface RankedRecommendation {
  params: BacktestParams;
  result: BacktestResult;
}

const SPACING_OPTIONS = [3, 5, 8];
const TIER_COUNT_OPTIONS = [4, 6, 8];
const MOMENTUM_OPTIONS = [false, true];
const EXIT_PRESETS: { takeProfitPercent: number; stopLossPercent: number }[] = [
  { takeProfitPercent: 10, stopLossPercent: 8 },
  { takeProfitPercent: 15, stopLossPercent: 10 },
  { takeProfitPercent: 20, stopLossPercent: 12 },
];

const REFERENCE_BUDGET = 100_000;
/** 資料筆數不足這個門檻就不跑回測，避免用太短的區間硬算出沒有意義的數字 */
const MIN_REQUIRED_TRADING_DAYS = 60;
const TOP_N = 5;

function buildParamCombinations(): BacktestParams[] {
  const combos: BacktestParams[] = [];
  for (const spacingPercent of SPACING_OPTIONS) {
    for (const tierCount of TIER_COUNT_OPTIONS) {
      for (const momentumConfirmEnabled of MOMENTUM_OPTIONS) {
        for (const exitPreset of EXIT_PRESETS) {
          combos.push({ spacingPercent, tierCount, momentumConfirmEnabled, ...exitPreset });
        }
      }
    }
  }
  return combos;
}

/**
 * 不做全面 grid-search 自動找「最佳解」——單一股票的歷史資料量有限，過度優化容易
 * 只是貼合這段歷史的雜訊，不代表未來也會這樣走。改成跑一組精選的參數組合
 * （間距%、檔位數、進場確認濾網開關、停利/停損%預設檔），把結果攤開來排序，
 * 讓使用者自己比較、決定，而不是被動接受一個「AI 說最好」的黑盒答案。
 *
 * 排序依「報酬率 ÷ max(最大回撤, 1)」這個簡單風險調整分數，避免直接挑報酬率最高
 * 但波動也最大的組合。
 */
export function recommendStrategyParams(history: PricePoint[]): RankedRecommendation[] {
  if (history.length < MIN_REQUIRED_TRADING_DAYS) {
    return [];
  }

  const results = buildParamCombinations().map((params) => ({
    params,
    result: runGridBacktest(history, params, REFERENCE_BUDGET),
  }));

  results.sort((a, b) => {
    const scoreA = a.result.totalReturnPercent / Math.max(a.result.maxDrawdownPercent, 1);
    const scoreB = b.result.totalReturnPercent / Math.max(b.result.maxDrawdownPercent, 1);
    return scoreB - scoreA;
  });

  return results.slice(0, TOP_N);
}
