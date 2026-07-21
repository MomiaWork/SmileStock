import { gridStrategy } from './grid-strategy';
import { maCrossStrategy } from './ma-cross-strategy';
import { rsiStrategy } from './rsi-strategy';
import type { PricePoint, StrategySignal } from './types';

export type StrategyType = 'grid' | 'rsi' | 'ma_cross';

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
