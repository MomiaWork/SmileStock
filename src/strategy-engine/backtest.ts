import { adviseEntry } from './entry-advisor';
import { adviseExit } from './exit-advisor';
import type { GridStrategyConfig } from './grid-strategy';
import type { Position } from './pnl';
import type { PricePoint } from './types';

export interface BacktestParams {
  spacingPercent: number;
  tierCount: number;
  momentumConfirmEnabled: boolean;
}

export interface BacktestResult {
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  tradeCount: number;
}

/**
 * 網格策略回測模擬器。錨點價固定用 history 第一天收盤價（模擬「這段期間一開始就設好網格」），
 * 跟使用者實際新增股票當下的價格無關——套用建議到表單時錨點會換成當下最新價。
 *
 * grid-strategy.ts 本身完全無狀態，只看「現價相對錨點跌到第幾檔」，不記得「這檔位是不是
 * 已經買過」；真實 App 讓使用者自己決定要不要照建議操作，但回測若照樣「只要條件成立就買」
 * 會變成同一檔位連續好幾天重複買進，嚴重高估報酬。這裡自己維護 boughtTiers 簿記，
 * 同一檔位在同一輪只買一次，直到 adviseExit 觸發出場、部位歸零才重置。
 */
export function runGridBacktest(
  history: PricePoint[],
  params: BacktestParams,
  referenceBudget: number,
): BacktestResult {
  if (history.length === 0) {
    return { totalReturnPercent: 0, maxDrawdownPercent: 0, tradeCount: 0 };
  }

  const gridConfig: GridStrategyConfig = {
    anchorPrice: history[0].close,
    budget: referenceBudget,
    spacingPercent: params.spacingPercent,
    tierCount: params.tierCount,
  };
  const strategyConfig = { type: 'grid' as const, params: gridConfig };

  let cash = referenceBudget;
  let position: Position | null = null;
  let boughtTiers = new Set<number>();
  let tradeCount = 0;
  let peakValue = referenceBudget;
  let maxDrawdownPercent = 0;

  for (let day = 0; day < history.length; day += 1) {
    const slice = history.slice(0, day + 1);
    const currentPrice = slice[slice.length - 1].close;

    if (position !== null) {
      // 沒有讓使用者設定或回測挑選停利/停損%——一律用 exit-advisor 內建的固定提醒門檻
      // （見 exit-advisor.ts 的 DEFAULT_TAKE_PROFIT_PERCENT/DEFAULT_STOP_LOSS_PERCENT），
      // 跟 App 裡「持倉與損益」卡片用的是同一套，回測結果才會跟實際提醒行為一致
      const exitAdvice = adviseExit(position, currentPrice);
      if (exitAdvice.action !== 'hold') {
        cash += position.quantity * currentPrice;
        position = null;
        boughtTiers = new Set<number>();
        tradeCount += 1;
      }
    }

    if (cash > 0) {
      const entryAdvice = adviseEntry(slice, strategyConfig, {
        momentumConfirmEnabled: params.momentumConfirmEnabled,
      });
      if (
        entryAdvice.action === 'enter' &&
        entryAdvice.tierIndex !== undefined &&
        entryAdvice.amount !== undefined &&
        !boughtTiers.has(entryAdvice.tierIndex)
      ) {
        const amount = Math.min(entryAdvice.amount, cash);
        const quantity = amount / currentPrice;
        position =
          position === null
            ? { quantity, avgCost: currentPrice }
            : {
                quantity: position.quantity + quantity,
                avgCost:
                  (position.avgCost * position.quantity + amount) / (position.quantity + quantity),
              };
        cash -= amount;
        boughtTiers.add(entryAdvice.tierIndex);
        tradeCount += 1;
      }
    }

    const portfolioValue = cash + (position !== null ? position.quantity * currentPrice : 0);
    peakValue = Math.max(peakValue, portfolioValue);
    const drawdownPercent = ((peakValue - portfolioValue) / peakValue) * 100;
    maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
  }

  const finalPrice = history[history.length - 1].close;
  const finalValue = cash + (position !== null ? position.quantity * finalPrice : 0);
  const totalReturnPercent = ((finalValue - referenceBudget) / referenceBudget) * 100;

  return { totalReturnPercent, maxDrawdownPercent, tradeCount };
}
