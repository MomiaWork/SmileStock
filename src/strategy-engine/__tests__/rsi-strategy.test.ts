import { rsiStrategy } from '../rsi-strategy';
import type { PricePoint } from '../types';

function toHistory(closes: number[]): PricePoint[] {
  return closes.map((close, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    close,
    high: close,
    low: close,
    volume: 1000,
  }));
}

describe('rsiStrategy', () => {
  test('RSI 剛好等於門檻時觸發', () => {
    // 4 期，漲跌交替各 1 元 -> avgGain = avgLoss -> RSI = 50
    const history = toHistory([100, 101, 100, 101, 100]);
    const signal = rsiStrategy.evaluate(history, { period: 4, threshold: 50 });
    expect(signal.triggered).toBe(true);
    expect(signal.reason).toContain('50.00');
  });

  test('連續下跌時 RSI 趨近 0，低於門檻觸發', () => {
    const history = toHistory([100, 99, 98, 97, 96]);
    const signal = rsiStrategy.evaluate(history, { period: 4, threshold: 30 });
    expect(signal.triggered).toBe(true);
  });

  test('連續上漲時 RSI 為 100，不觸發', () => {
    const history = toHistory([100, 101, 102, 103, 104]);
    const signal = rsiStrategy.evaluate(history, { period: 4, threshold: 30 });
    expect(signal.triggered).toBe(false);
  });

  test('使用預設 period(14)/threshold(30)', () => {
    const closes = Array.from({ length: 15 }, (_, i) => 100 - i);
    const signal = rsiStrategy.evaluate(toHistory(closes), {});
    expect(signal.triggered).toBe(true);
    expect(signal.reason).toContain('RSI(14)');
  });

  test('資料筆數不足 period+1 時回傳資料不足，不硬算', () => {
    const history = toHistory([100, 99, 98]);
    const signal = rsiStrategy.evaluate(history, { period: 14, threshold: 30 });
    expect(signal.triggered).toBe(false);
    expect(signal.reason).toContain('資料不足');
  });

  test('period 不是正整數時丟出明確錯誤', () => {
    const history = toHistory([100, 99, 98, 97, 96]);
    expect(() => rsiStrategy.evaluate(history, { period: 0 })).toThrow();
  });
});
