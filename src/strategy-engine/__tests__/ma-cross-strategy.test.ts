import { maCrossStrategy } from '../ma-cross-strategy';
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

describe('maCrossStrategy', () => {
  test('前一日短均線剛好等於長均線，最新一日黃金交叉後觸發', () => {
    // short(2)/long(3)：prev short=10, prev long=10 (剛好等於門檻)，now short=11.5 > now long=11
    const history = toHistory([10, 10, 10, 13]);
    const signal = maCrossStrategy.evaluate(history, { shortPeriod: 2, longPeriod: 3 });
    expect(signal.triggered).toBe(true);
  });

  test('短均線持續在長均線之下時不觸發', () => {
    const history = toHistory([13, 12, 11, 10]);
    const signal = maCrossStrategy.evaluate(history, { shortPeriod: 2, longPeriod: 3 });
    expect(signal.triggered).toBe(false);
  });

  test('資料筆數不足 longPeriod+1 時回傳資料不足，不硬算', () => {
    const history = toHistory([10, 10, 10]);
    const signal = maCrossStrategy.evaluate(history, { shortPeriod: 5, longPeriod: 20 });
    expect(signal.triggered).toBe(false);
    expect(signal.reason).toContain('資料不足');
  });

  test('使用預設 shortPeriod(5)/longPeriod(20)', () => {
    const signal = maCrossStrategy.evaluate(toHistory([10, 10, 10]), {});
    expect(signal.reason).toContain('MA(5/20)');
  });

  test('shortPeriod 不小於 longPeriod 時丟出明確錯誤', () => {
    const history = toHistory([10, 10, 10]);
    expect(() => maCrossStrategy.evaluate(history, { shortPeriod: 20, longPeriod: 5 })).toThrow();
  });
});
