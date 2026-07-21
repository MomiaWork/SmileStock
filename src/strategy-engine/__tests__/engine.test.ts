import { evaluateStrategy } from '../engine';
import type { PricePoint } from '../types';

function priceAt(close: number): PricePoint[] {
  return [{ date: '2026-07-21', close, high: close, low: close, volume: 1000 }];
}

describe('evaluateStrategy', () => {
  test('type=grid 分派到 grid-strategy', () => {
    const signal = evaluateStrategy(priceAt(95), {
      type: 'grid',
      params: { anchorPrice: 100, budget: 10000, spacingPercent: 5, tierCount: 5 },
    });
    expect(signal.triggered).toBe(true);
    expect(signal.tierIndex).toBe(1);
  });

  test('type=rsi 分派到 rsi-strategy', () => {
    const history = Array.from({ length: 3 }, (_, i) => priceAt(100 - i)[0]);
    const signal = evaluateStrategy(history, { type: 'rsi', params: { period: 14 } });
    expect(signal.triggered).toBe(false);
    expect(signal.reason).toContain('資料不足');
  });

  test('type=ma_cross 分派到 ma-cross-strategy', () => {
    const history = Array.from({ length: 3 }, (_, i) => priceAt(100 - i)[0]);
    const signal = evaluateStrategy(history, { type: 'ma_cross', params: {} });
    expect(signal.triggered).toBe(false);
    expect(signal.reason).toContain('資料不足');
  });

  test('未知的策略類型丟出明確錯誤', () => {
    expect(() =>
      evaluateStrategy(priceAt(100), {
        type: 'unknown' as unknown as 'grid',
        params: {},
      }),
    ).toThrow();
  });
});
