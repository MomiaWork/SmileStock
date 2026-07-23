import type { BacktestResult } from './backtest';
import { evaluatePyramid, type PyramidConfig, type PyramidState } from './pyramid-state-machine';
import type { PricePoint } from './types';

export type PyramidBacktestParams = Omit<PyramidConfig, 'entryPrice' | 'budget'>;

/**
 * 金字塔加碼策略回測模擬器。跟網格回測不同，金字塔狀態機（pyramid-state-machine.ts）
 * 本身已經內建「什麼時候加碼、什麼時候出場」的完整判斷，不需要另外接 adviseEntry/adviseExit。
 *
 * 支援多輪：第一輪只要資料量足夠（狀態機不再回報「資料不足」）就進場，用當天收盤價買進
 * 起始部位（weights[0] 那一份）——這代表「使用者本來就持有部位，開始交給狀態機接手管理」；
 * 之後逐日照狀態機的 add/exit 訊號調整部位，觸發 exit 就全部出場、回到現金。
 *
 * 出場後要不要開新一輪，門檻跟第一輪不同：金字塔規格本身沒有定義「什麼時候該重新進場」
 * （config.entryPrice 假設進場價已經是既定事實），如果比照第一輪「資料夠就進場」，
 * 出場隔天資料一定夠，等於天天都會立刻重新買回、形同沒有出場判斷。這裡改成沿用狀態機
 * 自己的多頭分類當重新進場的判斷依據：只有重新用當天價格試算的狀態機判斷已經是
 * TRENDING_UP／BREAKOUT_UP（真的有新的一波上漲成形），才開新一輪——跟網格用
 * trend-classifier 的笑臉/哭臉當進場安全閥是同樣的精神，差別是這裡借用金字塔狀態機
 * 自己的趨勢分類，不用另外接 trend-classifier。
 *
 * 每一輪的部位大小都以固定的 referenceBudget 試算（不會把上一輪的損益滾入下一輪的
 * 部位試算基準），但實際下單金額會被目前手上的現金（cash）封頂——跟網格回測用同一套
 * 「試算金額 vs 實際可動用現金取小值」的邏輯，虧損過的資金不會被無中生有補回來。
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
  let inPosition = false;
  let hasEnteredBefore = false;
  let prevState: PyramidState | undefined;
  let config: PyramidConfig | null = null;

  const weightSum = params.weights.reduce((acc, w) => acc + w, 0);

  for (let day = 0; day < history.length; day += 1) {
    const slice = history.slice(0, day + 1);
    const currentPrice = slice[slice.length - 1].close;

    if (!inPosition) {
      const trialConfig: PyramidConfig = { ...params, entryPrice: currentPrice, budget: referenceBudget };
      const { signal, nextState } = evaluatePyramid(slice, trialConfig);
      const dataReady = signal.action !== 'insufficient_data';
      const trendConfirmed =
        nextState.currentState === 'TRENDING_UP' || nextState.currentState === 'BREAKOUT_UP';
      const canEnter = dataReady && (!hasEnteredBefore || trendConfirmed);
      if (canEnter) {
        const rawAmount = referenceBudget * (params.weights[0] / weightSum);
        const amount = Math.min(rawAmount, cash);
        if (amount > 0) {
          config = trialConfig;
          quantity = amount / currentPrice;
          cash -= amount;
          tradeCount += 1;
          inPosition = true;
          hasEnteredBefore = true;
          prevState = nextState;
        }
      }
    } else if (config) {
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
        inPosition = false;
        config = null;
        prevState = undefined;
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
