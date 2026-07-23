import { gridStrategy } from './grid-strategy';
import { maCrossStrategy } from './ma-cross-strategy';
import { rsiStrategy } from './rsi-strategy';
import type { PricePoint, StrategySignal } from './types';

export type StrategyType = 'grid' | 'rsi' | 'ma_cross';

/**
 * 金字塔加碼滾動式策略（市場狀態機）不走 evaluateStrategy 分派，
 * 因為它是「有狀態」策略：介面為 (history, config, prevState) → { signal, nextState }，
 * PyramidState 需由呼叫端持久化後在下一次評估時傳回。
 * 規格見 docs/pyramid-state-machine-spec.md。
 */
export {
  evaluatePyramid,
  DEFAULT_PYRAMID_PARAMS,
  MARKET_STATE_LABEL,
} from './pyramid-state-machine';
export type {
  MarketState,
  PyramidAction,
  PyramidConfig,
  PyramidResult,
  PyramidSignal,
  PyramidState,
} from './pyramid-state-machine';

/**
 * 網格（微笑曲線）與金字塔加碼同時啟用時，用市場狀態路由到單一建議，
 * 避免兩策略同一天給出矛盾指示、重複動用預算。規則與 reason 組成見
 * recommendation-router.ts 內的說明。
 */
export { routeRecommendation } from './recommendation-router';
export type { RecommendedAction, RoutedRecommendation } from './recommendation-router';

export interface StrategyConfig {
  type: StrategyType;
  params: unknown;
}

/**
 * 統一入口：依 strategy_config.type 分派到對應策略實作。
 * 資料不足的判斷交給各策略自行處理並回傳明確原因，這裡不做任何補算。
 */
export function evaluateStrategy(history: PricePoint[], config: StrategyConfig): StrategySignal {
  switch (config.type) {
    case 'grid':
      return gridStrategy.evaluate(history, config.params);
    case 'rsi':
      return rsiStrategy.evaluate(history, config.params);
    case 'ma_cross':
      return maCrossStrategy.evaluate(history, config.params);
    default: {
      const exhaustiveCheck: never = config.type;
      throw new Error(`engine: 未知的策略類型 ${String(exhaustiveCheck)}`);
    }
  }
}
