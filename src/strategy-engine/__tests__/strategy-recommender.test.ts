import { classifyRisk, recommendStrategyParams } from '../strategy-recommender';
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
  test('資料筆數不足時回傳空建議清單，不勉強跑回測', () => {
    expect(recommendStrategyParams(syntheticHistory(30))).toEqual({
      buyHoldReturnPercent: 0,
      recommendations: [],
      bestGrid: null,
      bestPyramid: null,
    });
  });

  test('回傳兩種策略各自報酬率最高的一組，供「套用建議」同時啟用雙策略', () => {
    const { bestGrid, bestPyramid, recommendations } =
      recommendStrategyParams(syntheticHistory(300));
    expect(bestGrid?.strategyType).toBe('grid');
    expect(bestPyramid?.strategyType).toBe('pyramid');
    // 各自都是同類型組合中報酬率最高的（不會輸給榜單上任何同類型組合）
    for (const item of recommendations) {
      const best = item.strategyType === 'grid' ? bestGrid : bestPyramid;
      expect(best!.result.totalReturnPercent).toBeGreaterThanOrEqual(
        item.result.totalReturnPercent,
      );
    }
  });

  test('資料足夠時，網格3×3×2=18組合＋金字塔2×3=6組合混合排序，回傳前 5 名', () => {
    const { recommendations } = recommendStrategyParams(syntheticHistory(300));
    expect(recommendations).toHaveLength(5);
  });

  test('回傳同期買進持有報酬率當對照基準', () => {
    const history = syntheticHistory(300);
    const { buyHoldReturnPercent } = recommendStrategyParams(history);
    const expected =
      ((history[history.length - 1].close - history[0].close) / history[0].close) * 100;
    expect(buyHoldReturnPercent).toBeCloseTo(expected, 5);
  });

  test('回傳結果依總報酬率由高到低排序', () => {
    const { recommendations } = recommendStrategyParams(syntheticHistory(300));
    for (let i = 1; i < recommendations.length; i += 1) {
      expect(recommendations[i].result.totalReturnPercent).toBeLessThanOrEqual(
        recommendations[i - 1].result.totalReturnPercent,
      );
    }
  });

  test('每筆結果都帶有策略類型標籤、對應的完整參數組合、依最大回撤算出的風險等級', () => {
    const { recommendations } = recommendStrategyParams(syntheticHistory(300));
    for (const item of recommendations) {
      expect(['grid', 'pyramid']).toContain(item.strategyType);
      expect(item.riskLevel).toBe(classifyRisk(item.result.maxDrawdownPercent));
      if (item.strategyType === 'grid') {
        expect(item.params).toEqual(
          expect.objectContaining({
            spacingPercent: expect.any(Number),
            tierCount: expect.any(Number),
            momentumConfirmEnabled: expect.any(Boolean),
          }),
        );
      } else {
        expect(item.params).toEqual(
          expect.objectContaining({
            weights: expect.any(Array),
            addTriggerPct: expect.any(Number),
          }),
        );
      }
    }
  });
});

describe('classifyRisk', () => {
  test('最大回撤低於8%為低風險', () => {
    expect(classifyRisk(0)).toBe('low');
    expect(classifyRisk(7.99)).toBe('low');
  });

  test('最大回撤介於8%~20%（不含20%）為中風險', () => {
    expect(classifyRisk(8)).toBe('medium');
    expect(classifyRisk(19.99)).toBe('medium');
  });

  test('最大回撤達20%以上為高風險', () => {
    expect(classifyRisk(20)).toBe('high');
    expect(classifyRisk(50)).toBe('high');
  });
});
