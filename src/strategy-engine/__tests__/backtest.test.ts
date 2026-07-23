import { runGridBacktest } from '../backtest';
import type { PricePoint } from '../types';

function bars(closes: number[]): PricePoint[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    close,
    high: close,
    low: close,
    volume: 1000,
  }));
}

// 出場一律用 exit-advisor 內建的固定門檻（停利 10%／停損 8%），下面測試案例的數字
// 都是照這組門檻設計的
const baseParams = {
  spacingPercent: 5,
  tierCount: 3,
  momentumConfirmEnabled: false,
};

describe('runGridBacktest', () => {
  test('同一檔位在確認未出場前不會重複買進', () => {
    // 11 天暖身(100) -> 跌破第1檔且破底(90,88) -> 連續兩天收高確認止穩(91,93) -> 買進第1檔
    // -> 隔天(94)價格仍在第1檔區間但已買過，不重複買
    const closes = [...Array(11).fill(100), 90, 88, 91, 93, 94];
    const result = runGridBacktest(bars(closes), baseParams, 100000);
    expect(result.tradeCount).toBe(1);
  });

  test('停利出場後檔位簿記重置，之後可以重新買進同一檔位', () => {
    const closes = [
      ...Array(11).fill(100),
      90,
      88,
      91,
      93, // 買進第1檔（成本93）
      105, // 報酬率 (105-93)/93 ≈ 12.9% ≥ 停利門檻 10%，觸發停利出場
      100,
      95,
      90,
      88,
      91,
      93, // 再跌一輪，重新確認止穩後應該可以再買進第1檔
    ];
    const result = runGridBacktest(bars(closes), baseParams, 100000);
    // 買進(day14) -> 停利賣出(day16) -> 再次買進(day22) = 3 筆交易
    expect(result.tradeCount).toBe(3);
    expect(result.totalReturnPercent).toBeGreaterThan(0);
  });

  test('持倉未觸發停損時，帳面回落會反映在最大回撤，且不會被當成出場', () => {
    const closes = [
      ...Array(11).fill(100),
      90,
      88,
      91,
      93, // 買進第1檔（成本93）
      90,
      87, // 續跌但報酬率 -6.45% 未達停損門檻 -8%，不出場
    ];
    const result = runGridBacktest(bars(closes), baseParams, 100000);
    expect(result.tradeCount).toBe(1); // 只有買進，沒有出場
    expect(result.maxDrawdownPercent).toBeGreaterThan(0);
    expect(result.maxDrawdownPercent).toBeCloseTo(1.43, 1);
  });

  test('完全沒有資料時回傳全 0 結果，不噴錯', () => {
    const result = runGridBacktest([], baseParams, 100000);
    expect(result).toEqual({ totalReturnPercent: 0, maxDrawdownPercent: 0, tradeCount: 0 });
  });
});
