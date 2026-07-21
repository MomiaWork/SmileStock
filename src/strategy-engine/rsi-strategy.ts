import type { PricePoint, Strategy, StrategySignal } from './types';

export interface RsiStrategyConfig {
  period?: number;
  threshold?: number;
}

const DEFAULT_PERIOD = 14;
const DEFAULT_THRESHOLD = 30;

function isRsiStrategyConfig(config: unknown): config is RsiStrategyConfig {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  if (c.period !== undefined && typeof c.period !== 'number') return false;
  if (c.threshold !== undefined && typeof c.threshold !== 'number') return false;
  return true;
}

/**
 * 標準 RSI（Wilder's smoothing）。
 * 需要至少 period + 1 筆收盤價才能算出第一個 RSI 值。
 */
function calculateRsi(closes: number[], period: number): number {
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gainSum += delta;
    else lossSum += -delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export const rsiStrategy: Strategy = {
  evaluate(history: PricePoint[], config: unknown): StrategySignal {
    if (!isRsiStrategyConfig(config)) {
      throw new Error('rsi-strategy: config 格式不正確，period/threshold 必須是數字');
    }
    const period = config.period ?? DEFAULT_PERIOD;
    const threshold = config.threshold ?? DEFAULT_THRESHOLD;

    if (!Number.isInteger(period) || period < 1) {
      throw new Error('rsi-strategy: period 必須是大於等於 1 的整數');
    }

    const requiredPoints = period + 1;
    if (history.length < requiredPoints) {
      return {
        triggered: false,
        reason: `資料不足：RSI(${period}) 需要至少 ${requiredPoints} 筆收盤價，目前只有 ${history.length} 筆`,
      };
    }

    const closes = history.map((p) => p.close);
    const rsi = calculateRsi(closes, period);

    if (rsi <= threshold) {
      return {
        triggered: true,
        reason: `RSI(${period}) = ${rsi.toFixed(2)}，已低於門檻 ${threshold}`,
      };
    }

    return {
      triggered: false,
      reason: `RSI(${period}) = ${rsi.toFixed(2)}，尚未低於門檻 ${threshold}`,
    };
  },
};
