import type { PricePoint, Strategy, StrategySignal } from './types';

export interface MaCrossStrategyConfig {
  shortPeriod?: number;
  longPeriod?: number;
}

const DEFAULT_SHORT_PERIOD = 5;
const DEFAULT_LONG_PERIOD = 20;

function isMaCrossStrategyConfig(config: unknown): config is MaCrossStrategyConfig {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  if (c.shortPeriod !== undefined && typeof c.shortPeriod !== 'number') return false;
  if (c.longPeriod !== undefined && typeof c.longPeriod !== 'number') return false;
  return true;
}

function simpleMovingAverage(closes: number[], period: number, endIndex: number): number {
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i += 1) {
    sum += closes[i];
  }
  return sum / period;
}

/**
 * 短均線黃金交叉長均線：前一筆短均線 <= 長均線，最新一筆短均線 > 長均線，視為買進訊號。
 */
export const maCrossStrategy: Strategy = {
  evaluate(history: PricePoint[], config: unknown): StrategySignal {
    if (!isMaCrossStrategyConfig(config)) {
      throw new Error('ma-cross-strategy: config 格式不正確，shortPeriod/longPeriod 必須是數字');
    }
    const shortPeriod = config.shortPeriod ?? DEFAULT_SHORT_PERIOD;
    const longPeriod = config.longPeriod ?? DEFAULT_LONG_PERIOD;

    if (!Number.isInteger(shortPeriod) || shortPeriod < 1) {
      throw new Error('ma-cross-strategy: shortPeriod 必須是大於等於 1 的整數');
    }
    if (!Number.isInteger(longPeriod) || longPeriod < 1) {
      throw new Error('ma-cross-strategy: longPeriod 必須是大於等於 1 的整數');
    }
    if (shortPeriod >= longPeriod) {
      throw new Error('ma-cross-strategy: shortPeriod 必須小於 longPeriod');
    }

    const requiredPoints = longPeriod + 1;
    if (history.length < requiredPoints) {
      return {
        triggered: false,
        reason: `資料不足：MA(${shortPeriod}/${longPeriod}) 需要至少 ${requiredPoints} 筆收盤價，目前只有 ${history.length} 筆`,
      };
    }

    const closes = history.map((p) => p.close);
    const lastIndex = closes.length - 1;

    const shortMaPrev = simpleMovingAverage(closes, shortPeriod, lastIndex - 1);
    const longMaPrev = simpleMovingAverage(closes, longPeriod, lastIndex - 1);
    const shortMaNow = simpleMovingAverage(closes, shortPeriod, lastIndex);
    const longMaNow = simpleMovingAverage(closes, longPeriod, lastIndex);

    const crossed = shortMaPrev <= longMaPrev && shortMaNow > longMaNow;

    if (crossed) {
      return {
        triggered: true,
        reason: `MA(${shortPeriod}) ${shortMaNow.toFixed(2)} 黃金交叉 MA(${longPeriod}) ${longMaNow.toFixed(2)}`,
      };
    }

    return {
      triggered: false,
      reason: `MA(${shortPeriod}) ${shortMaNow.toFixed(2)} 尚未黃金交叉 MA(${longPeriod}) ${longMaNow.toFixed(2)}`,
    };
  },
};
