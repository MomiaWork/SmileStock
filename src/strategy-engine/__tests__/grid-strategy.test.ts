import { gridStrategy, type GridStrategyConfig } from '../grid-strategy';
import type { PricePoint } from '../types';

function priceAt(close: number): PricePoint[] {
  return [{ date: '2026-07-21', close, high: close, low: close, volume: 1000 }];
}

const baseConfig: GridStrategyConfig = {
  anchorPrice: 100,
  budget: 10500,
  spacingPercent: 5,
  tierCount: 5,
};

describe('gridStrategy', () => {
  test('尚未跌破第一檔時不觸發', () => {
    const signal = gridStrategy.evaluate(priceAt(96), baseConfig);
    expect(signal.triggered).toBe(false);
    expect(signal.tierIndex).toBeUndefined();
  });

  test('剛好等於第一檔門檻時觸發第一檔', () => {
    const signal = gridStrategy.evaluate(priceAt(95), baseConfig);
    expect(signal.triggered).toBe(true);
    expect(signal.tierIndex).toBe(1);
  });

  test('一次跌穿兩檔時回報最深的第二檔，而不是第一檔', () => {
    const signal = gridStrategy.evaluate(priceAt(88), baseConfig);
    expect(signal.triggered).toBe(true);
    expect(signal.tierIndex).toBe(2);
  });

  test('跌破最深一檔時回報最後一檔', () => {
    const signal = gridStrategy.evaluate(priceAt(50), baseConfig);
    expect(signal.triggered).toBe(true);
    expect(signal.tierIndex).toBe(5);
  });

  test('依金字塔權重 1:1.5:2:2.5:3 分配每檔建議投入金額', () => {
    const signal = gridStrategy.evaluate(priceAt(88), baseConfig);
    expect(signal.reason).toContain('1575');
  });

  test('沒有任何價格資料時回傳資料不足', () => {
    const signal = gridStrategy.evaluate([], baseConfig);
    expect(signal.triggered).toBe(false);
    expect(signal.reason).toContain('資料不足');
  });

  test('config 缺少必要欄位時丟出明確錯誤', () => {
    expect(() => gridStrategy.evaluate(priceAt(95), { anchorPrice: 100 })).toThrow();
  });

  test('spacingPercent 不是正數時丟出明確錯誤', () => {
    expect(() =>
      gridStrategy.evaluate(priceAt(95), { ...baseConfig, spacingPercent: 0 }),
    ).toThrow();
  });
});
