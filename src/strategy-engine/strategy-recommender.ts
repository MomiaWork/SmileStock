import { runGridBacktest, type BacktestParams, type BacktestResult } from './backtest';
import { runPyramidBacktest, type PyramidBacktestParams } from './pyramid-backtest';
import { DEFAULT_PYRAMID_PARAMS } from './pyramid-state-machine';
import type { PricePoint } from './types';

export type RankedRecommendation =
  | { strategyType: 'grid'; params: BacktestParams; result: BacktestResult }
  | { strategyType: 'pyramid'; params: PyramidBacktestParams; result: BacktestResult };

export interface RecommendationResult {
  /** 同期間單純買進持有的報酬率，當所有策略組合的對照基準——策略沒有明顯優於這個數字，
   * 代表這段期間主動操作不見得比單純持有划算，讓使用者自己判斷 */
  buyHoldReturnPercent: number;
  recommendations: RankedRecommendation[];
}

const SPACING_OPTIONS = [3, 5, 8];
const TIER_COUNT_OPTIONS = [4, 6, 8];
const MOMENTUM_OPTIONS = [false, true];
const EXIT_PRESETS: { takeProfitPercent: number; stopLossPercent: number }[] = [
  { takeProfitPercent: 10, stopLossPercent: 8 },
  { takeProfitPercent: 15, stopLossPercent: 10 },
  { takeProfitPercent: 20, stopLossPercent: 12 },
];

/** 金字塔加碼權重：等權重（每級加碼金額相同）vs 金字塔式（越漲加越多），
 * 其餘市場狀態判斷參數（均線、盤整、ATR 等）維持規格預設值，不在回測比較裡調整——
 * 那些是「怎麼判斷趨勢」的參數，不是使用者的風險偏好，亂調容易只是貼合歷史雜訊 */
const PYRAMID_WEIGHTS_OPTIONS: number[][] = [
  [1, 1, 1, 1],
  [1, 1.5, 2, 2.5],
];
const PYRAMID_ADD_TRIGGER_OPTIONS = [3, 5, 8];
const PYRAMID_HARD_STOP_OPTIONS = [20, 35];

const REFERENCE_BUDGET = 100_000;
/** 資料筆數不足這個門檻就不跑回測，避免用太短的區間硬算出沒有意義的數字。
 * 剛好對齊金字塔狀態機預設參數的 maLong（60），兩種策略共用同一道門檻 */
const MIN_REQUIRED_TRADING_DAYS = 60;
const TOP_N = 5;

function buildGridParamCombinations(): BacktestParams[] {
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

function buildPyramidParamCombinations(): PyramidBacktestParams[] {
  const combos: PyramidBacktestParams[] = [];
  for (const weights of PYRAMID_WEIGHTS_OPTIONS) {
    for (const addTriggerPct of PYRAMID_ADD_TRIGGER_OPTIONS) {
      for (const hardStopPct of PYRAMID_HARD_STOP_OPTIONS) {
        combos.push({ ...DEFAULT_PYRAMID_PARAMS, weights, addTriggerPct, hardStopPct });
      }
    }
  }
  return combos;
}

/**
 * 不做全面 grid-search 自動找「最佳解」——單一股票的歷史資料量有限，過度優化容易
 * 只是貼合這段歷史的雜訊，不代表未來也會這樣走。改成跑兩種策略性格各一組精選的參數組合
 * （網格：逢跌加碼的區間震盪策略；金字塔加碼：順勢加碼、趨勢反轉才出場的狀態機策略），
 * 混在一起排序，把結果攤開來讓使用者自己比較、決定，而不是被動接受一個「AI 說最好」的
 * 黑盒答案——也不是只給網格一種選項，畢竟網格本質是逢低承接，遇到單邊噴出的股票（例如
 * 只漲不回頭）幾乎不會成交，這種時候金字塔加碼或甚至單純買進持有可能才是更貼近股性的做法。
 *
 * 排序依「報酬率 ÷ max(最大回撤, 1)」這個簡單風險調整分數，避免直接挑報酬率最高
 * 但波動也最大的組合。額外附上同期買進持有報酬率當對照基準，讓使用者能判斷「這段期間
 * 主動操作到底有沒有比單純持有更好」，而不是只看到策略自己的數字就誤以為那是股票能做到
 * 的最好結果。
 */
export function recommendStrategyParams(history: PricePoint[]): RecommendationResult {
  if (history.length < MIN_REQUIRED_TRADING_DAYS) {
    return { buyHoldReturnPercent: 0, recommendations: [] };
  }

  const gridResults: RankedRecommendation[] = buildGridParamCombinations().map((params) => ({
    strategyType: 'grid',
    params,
    result: runGridBacktest(history, params, REFERENCE_BUDGET),
  }));
  const pyramidResults: RankedRecommendation[] = buildPyramidParamCombinations().map((params) => ({
    strategyType: 'pyramid',
    params,
    result: runPyramidBacktest(history, params, REFERENCE_BUDGET),
  }));

  const results = [...gridResults, ...pyramidResults];
  results.sort((a, b) => {
    const scoreA = a.result.totalReturnPercent / Math.max(a.result.maxDrawdownPercent, 1);
    const scoreB = b.result.totalReturnPercent / Math.max(b.result.maxDrawdownPercent, 1);
    return scoreB - scoreA;
  });

  const first = history[0].close;
  const last = history[history.length - 1].close;
  const buyHoldReturnPercent = ((last - first) / first) * 100;

  return { buyHoldReturnPercent, recommendations: results.slice(0, TOP_N) };
}
