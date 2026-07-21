import { calculatePnl } from '../pnl';

describe('calculatePnl', () => {
  test('現價高於成本時計算正報酬率', () => {
    const result = calculatePnl({ quantity: 10, avgCost: 100 }, 110);
    expect(result.costBasis).toBe(1000);
    expect(result.marketValue).toBe(1100);
    expect(result.pnl).toBe(100);
    expect(result.returnRatePercent).toBeCloseTo(10);
  });

  test('現價低於成本時計算負報酬率', () => {
    const result = calculatePnl({ quantity: 10, avgCost: 100 }, 90);
    expect(result.pnl).toBe(-100);
    expect(result.returnRatePercent).toBeCloseTo(-10);
  });

  test('現價剛好等於成本時報酬率為 0', () => {
    const result = calculatePnl({ quantity: 10, avgCost: 100 }, 100);
    expect(result.pnl).toBe(0);
    expect(result.returnRatePercent).toBe(0);
  });

  test('quantity 不是正數時丟出明確錯誤', () => {
    expect(() => calculatePnl({ quantity: 0, avgCost: 100 }, 100)).toThrow();
  });

  test('avgCost 不是正數時丟出明確錯誤', () => {
    expect(() => calculatePnl({ quantity: 10, avgCost: 0 }, 100)).toThrow();
  });

  test('currentPrice 不是正數時丟出明確錯誤', () => {
    expect(() => calculatePnl({ quantity: 10, avgCost: 100 }, 0)).toThrow();
  });
});
