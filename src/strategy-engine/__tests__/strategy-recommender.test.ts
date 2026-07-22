import { recommendStrategyParams } from '../strategy-recommender';
import type { PricePoint } from '../types';

/** 產生一段有漲有跌、足夠長的合成走勢，用來驗證組合數量與排序，不驗證精確數值 */
function syntheticHistory(days: number): PricePoint[] {
  const points: PricePoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const close = 100 + 15 * Math.sin(i / 12) + i * 0.05;
    points.push({
      date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
      close: Math.round(close * 100) / 100,
      high: close + 1,
      low: close - 1,
      volume: 1000,
    });
  }
  return points;
}

describe('recommendStrategyParams', () => {
  test('資料筆數不足時回傳空陣列，不勉強跑回測', () => {
    expect(recommendStrategyParams(syntheticHistory(30))).toEqual([]);
  });

  test('資料足夠時，跑滿 3×3×2×3=54 組合並回傳前 5 名', () => {
    const results = recommendStrategyParams(syntheticHistory(300));
    expect(results).toHaveLength(5);
  });

  test('回傳結果依風險調整分數（報酬率 ÷ max(最大回撤,1)）由高到低排序', () => {
    const results = recommendStrategyParams(syntheticHistory(300));
    const scores = results.map(
      (r) => r.result.totalReturnPercent / Math.max(r.result.maxDrawdownPercent, 1),
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  test('每筆結果都帶有完整的參數組合', () => {
    const [top] = recommendStrategyParams(syntheticHistory(300));
    expect(top.params).toEqual(
      expect.objectContaining({
        spacingPercent: expect.any(Number),
        tierCount: expect.any(Number),
        momentumConfirmEnabled: expect.any(Boolean),
        takeProfitPercent: expect.any(Number),
        stopLossPercent: expect.any(Number),
      }),
    );
  });
});
