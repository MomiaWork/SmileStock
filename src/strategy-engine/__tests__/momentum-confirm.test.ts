import { checkMomentumConfirm } from '../momentum-confirm';
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

describe('checkMomentumConfirm', () => {
  test('RSI 觸發（超賣）但均線未交叉時，仍視為動能確認通過', () => {
    // 21 天持續下跌：RSI 深度超賣，短均線持續在長均線下方，沒有黃金交叉
    const closes = Array.from({ length: 21 }, (_, i) => 200 - i * 5);
    const result = checkMomentumConfirm(bars(closes));
    expect(result.confirmed).toBe(true);
  });

  test('均線黃金交叉但 RSI 未超賣時，仍視為動能確認通過', () => {
    // 先走平，末端小幅反彈觸發黃金交叉，但反彈幅度不足以讓 RSI 進入超賣區
    const closes = [
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 99, 98, 97,
      100, 112,
    ];
    const result = checkMomentumConfirm(bars(closes));
    expect(result.confirmed).toBe(true);
  });

  test('RSI 超賣且均線同時黃金交叉時，也是動能確認通過', () => {
    // 先深跌讓 RSI 探底，接一段長時間走平讓長均線跟上到低檔，最後小反彈觸發黃金交叉
    const decline = Array.from({ length: 15 }, (_, i) => 200 - i * 10);
    const flat = Array.from({ length: 19 }, () => 60);
    const closes = [...decline, ...flat, 66];
    const result = checkMomentumConfirm(bars(closes));
    expect(result.confirmed).toBe(true);
  });

  test('完全走平，RSI 不超賣、均線也沒有交叉時，動能確認不通過', () => {
    const closes = Array.from({ length: 21 }, () => 100);
    const result = checkMomentumConfirm(bars(closes));
    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain('尚未轉強');
  });

  test('資料筆數不足時（RSI/均線都判斷資料不足），動能確認不通過', () => {
    const result = checkMomentumConfirm(bars([100, 101, 102]));
    expect(result.confirmed).toBe(false);
  });
});
