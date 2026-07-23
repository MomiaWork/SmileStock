import { runGridBacktest, type BacktestParams, type BacktestResult } from './backtest';
import { runPyramidBacktest, type PyramidBacktestParams } from './pyramid-backtest';
import { DEFAULT_PYRAMID_PARAMS } from './pyramid-state-machine';
import type { PricePoint } from './types';

export type RiskLevel = 'low' | 'medium' | 'high';

export type RankedRecommendation =
  | { strategyType: 'grid'; params: BacktestParams; result: BacktestResult; riskLevel: RiskLevel }
  | {
      strategyType: 'pyramid';
      params: PyramidBacktestParams;
      result: BacktestResult;
      riskLevel: RiskLevel;
    };

export interface RecommendationResult {
  /** 同期間單純買進持有的報酬率，當所有策略組合的對照基準——策略沒有明顯優於這個數字，
   * 代表這段期間主動操作不見得比單純持有划算，讓使用者自己判斷 */
  buyHoldReturnPercent: number;
  recommendations: RankedRecommendation[];
  /** 全部組合中報酬率最高的網格參數。兩策略預設會一起啟用（由市場狀態路由決定當天聽誰的），
   * 所以「套用建議」需要的是各策略最佳的一組，不是混合排行的第一名 */
  bestGrid: Extract<RankedRecommendation, { strategyType: 'grid' }> | null;
  bestPyramid: Extract<RankedRecommendation, { strategyType: 'pyramid' }> | null;
}

const RISK_LOW_MAX_DRAWDOWN = 8;
const RISK_MEDIUM_MAX_DRAWDOWN = 20;

/** 依最大回撤把組合標成低/中/高風險，純粹描述「這組歷史上曾經帳面回落多少」，
 * 不是在幫使用者做「該不該冒這個險」的判斷——那是使用者自己的事 */
export function classifyRisk(maxDrawdownPercent: number): RiskLevel {
  if (maxDrawdownPercent < RISK_LOW_MAX_DRAWDOWN) return 'low';
  if (maxDrawdownPercent < RISK_MEDIUM_MAX_DRAWDOWN) return 'medium';
  return 'high';
}

const SPACING_OPTIONS = [3, 5, 8];
const TIER_COUNT_OPTIONS = [4, 6, 8];
const MOMENTUM_OPTIONS = [false, true];

/** 金字塔加碼權重：等權重（每級加碼金額相同）／金字塔式（越漲加越多，順勢重壓後段）／
 * 遞減式（越漲加越少，攤平成本集中在趨勢前段，符合「越接近相對高點、加碼應越保守」的
 * 順勢加碼原則）。其餘市場狀態判斷參數（均線、盤整、ATR 等）維持規格預設值，不在回測
 * 比較裡調整——那些是「怎麼判斷趨勢」的參數，不是使用者的風險偏好，亂調容易只是貼合
 * 歷史雜訊。這幾組（權重／加碼觸發）也是 WatchlistForm 簡化 UI 唯一開放使用者選的選項，
 * 直接 export 給表單重用，確保表單能選到的組合永遠跟這裡回測驗證過的組合一致，
 * 不會兩邊各自維護一份數字造成漂移。 */
export const PYRAMID_WEIGHTS_OPTIONS: number[][] = [
  [1, 1, 1, 1],
  [1, 1.5, 2, 2.5],
  [2.5, 2, 1.5, 1],
];
export const PYRAMID_ADD_TRIGGER_OPTIONS = [3, 5, 8];

export type PyramidWeightsProfile = 'equal' | 'pyramid' | 'decreasing';

export function pyramidWeightsForProfile(profile: PyramidWeightsProfile): number[] {
  switch (profile) {
    case 'equal':
      return PYRAMID_WEIGHTS_OPTIONS[0];
    case 'pyramid':
      return PYRAMID_WEIGHTS_OPTIONS[1];
    case 'decreasing':
      return PYRAMID_WEIGHTS_OPTIONS[2];
  }
}

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
        combos.push({ spacingPercent, tierCount, momentumConfirmEnabled });
      }
    }
  }
  return combos;
}

function buildPyramidParamCombinations(): PyramidBacktestParams[] {
  const combos: PyramidBacktestParams[] = [];
  for (const weights of PYRAMID_WEIGHTS_OPTIONS) {
    for (const addTriggerPct of PYRAMID_ADD_TRIGGER_OPTIONS) {
      combos.push({ ...DEFAULT_PYRAMID_PARAMS, weights, addTriggerPct });
    }
  }
  return combos;
}

/**
 * 不做全面 grid-search 自動找「最佳解」——單一標的的歷史資料量有限，過度優化容易
 * 只是貼合這段歷史的雜訊，不代表未來也會這樣走。改成跑兩種策略性格各一組精選的參數組合
 * （網格：逢跌加碼的區間震盪策略；金字塔加碼：順勢加碼、趨勢反轉才出場的狀態機策略），
 * 混在一起依報酬率排序、取前 5 名——也不是只給網格一種選項，畢竟網格本質是逢低承接，
 * 遇到單邊噴出的標的（例如只漲不回頭）幾乎不會成交，這種時候金字塔加碼或甚至單純買進
 * 持有可能才是更貼近股性的做法。
 *
 * 直接依報酬率排序、不用風險調整分數：曾經試過「報酬率 ÷ max(最大回撤,1)」這種風險調整
 * 分數，結果幾乎不交易、回撤趨近於0的網格組合分數會系統性地贏過金字塔加碼「回撤較大但
 * 報酬高很多」的組合，導致榜單前幾名長期被「安全但賺很少」的組合佔滿，使用者根本看不到
 * 報酬率高很多的選項存在。改成排名只看報酬率，每筆結果額外附上 riskLevel（依最大回撤
 * 分低/中/高）讓風險攤開來看，「要不要為了更高報酬承擔更高回撤」交給使用者自己判斷，
 * 而不是被排序公式的主觀權重先幫他篩掉。額外附上同期買進持有報酬率當對照基準，讓使用者
 * 能判斷「這段期間主動操作到底有沒有比單純持有更好」。
 */
export function recommendStrategyParams(history: PricePoint[]): RecommendationResult {
  if (history.length < MIN_REQUIRED_TRADING_DAYS) {
    return { buyHoldReturnPercent: 0, recommendations: [], bestGrid: null, bestPyramid: null };
  }

  const byReturnDesc = (a: RankedRecommendation, b: RankedRecommendation): number =>
    b.result.totalReturnPercent - a.result.totalReturnPercent;

  const gridResults = buildGridParamCombinations()
    .map((params): Extract<RankedRecommendation, { strategyType: 'grid' }> => {
      const result = runGridBacktest(history, params, REFERENCE_BUDGET);
      return {
        strategyType: 'grid',
        params,
        result,
        riskLevel: classifyRisk(result.maxDrawdownPercent),
      };
    })
    .sort(byReturnDesc);
  const pyramidResults = buildPyramidParamCombinations()
    .map((params): Extract<RankedRecommendation, { strategyType: 'pyramid' }> => {
      const result = runPyramidBacktest(history, params, REFERENCE_BUDGET);
      return {
        strategyType: 'pyramid',
        params,
        result,
        riskLevel: classifyRisk(result.maxDrawdownPercent),
      };
    })
    .sort(byReturnDesc);

  const results: RankedRecommendation[] = [...gridResults, ...pyramidResults];
  results.sort(byReturnDesc);

  const first = history[0].close;
  const last = history[history.length - 1].close;
  const buyHoldReturnPercent = ((last - first) / first) * 100;

  return {
    buyHoldReturnPercent,
    recommendations: results.slice(0, TOP_N),
    bestGrid: gridResults[0] ?? null,
    bestPyramid: pyramidResults[0] ?? null,
  };
}
