import type { BacktestResult } from './backtest';
import { evaluatePyramid, type PyramidConfig, type PyramidState } from './pyramid-state-machine';
import type { PricePoint } from './types';

export type PyramidBacktestParams = Omit<PyramidConfig, 'entryPrice' | 'budget'>;

/**
 * 金字塔加碼策略回測模擬器。跟網格回測不同，金字塔狀態機（pyramid-state-machine.ts）
 * 本身已經內建「什麼時候加碼、什麼時候出場」的完整判斷，不需要另外接 adviseEntry/adviseExit。
 *
 * 只模擬「一輪」：找到狀態機第一次跑出非「資料不足」訊號的那天，用當天收盤價買進起始部位
 * （weights[0] 那一份），之後逐日照狀態機的 add/exit 訊號調整部位；一旦觸發 exit 出場，
 * 這輪就結束、剩餘資金留在現金不再進場到期末——金字塔策略設計上是管理「一段趨勢」的加碼
 * 與停損，不是像網格那樣可以重複進出的區間策略，回測若讓它出場後自動重新進場，等於是
 * 替它加了規格沒有定義的「怎麼判斷該不該開始新一輪」邏輯，會失真。
 */
export function runPyramidBacktest(
  history: PricePoint[],
  params: PyramidBacktestParams,
  referenceBudget: number,
): BacktestResult {
  if (history.length === 0) {
    return { totalReturnPercent: 0, maxDrawdownPercent: 0, tradeCount: 0 };
  }

  let cash = referenceBudget;
  let quantity = 0;
  let tradeCount = 0;
  let peakValue = referenceBudget;
  let maxDrawdownPercent = 0;
  let entered = false;
  let exited = false;
  let prevState: PyramidState | undefined;
  let config: PyramidConfig | null = null;

  const weightSum = params.weights.reduce((acc, w) => acc + w, 0);

  for (let day = 0; day < history.length; day += 1) {
    const slice = history.slice(0, day + 1);
    const currentPrice = slice[slice.length - 1].close;

    if (!exited && !entered) {
      const trialConfig: PyramidConfig = { ...params, entryPrice: currentPrice, budget: referenceBudget };
      const { signal, nextState } = evaluatePyramid(slice, trialConfig);
      if (signal.action !== 'insufficient_data') {
        config = trialConfig;
        const amount = referenceBudget * (params.weights[0] / weightSum);
        quantity = amount / currentPrice;
        cash -= amount;
        tradeCount += 1;
        entered = true;
        prevState = nextState;
      }
    } else if (!exited && entered && config) {
      const { signal, nextState } = evaluatePyramid(slice, config, prevState);
      prevState = nextState;
      if (signal.action === 'add' && signal.amount !== undefined) {
        const amount = Math.min(signal.amount, cash);
        if (amount > 0) {
          quantity += amount / currentPrice;
          cash -= amount;
          tradeCount += 1;
        }
      } else if (signal.action === 'exit') {
        cash += quantity * currentPrice;
        quantity = 0;
        tradeCount += 1;
        exited = true;
      }
    }

    const portfolioValue = cash + quantity * currentPrice;
    peakValue = Math.max(peakValue, portfolioValue);
    const drawdownPercent = ((peakValue - portfolioValue) / peakValue) * 100;
    maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
  }

  const finalPrice = history[history.length - 1].close;
  const finalValue = cash + quantity * finalPrice;
  const totalReturnPercent = ((finalValue - referenceBudget) / referenceBudget) * 100;

  return { totalReturnPercent, maxDrawdownPercent, tradeCount };
}
