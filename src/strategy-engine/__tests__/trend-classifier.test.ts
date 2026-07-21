import { classifyTrend } from '../trend-classifier';
import type { PricePoint } from '../types';

function closesToHistory(closes: number[]): PricePoint[] {
  return closes.map((close, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    close,
    high: close,
    low: close,
    volume: 1000,
  }));
}

const config = { lookbackDays: 5, confirmDays: 2 };

describe('classifyTrend', () => {
  test('資料不足時回傳 neutral 並標註資料不足', () => {
    const result = classifyTrend(closesToHistory([100, 99, 98, 97]), config);
    expect(result.face).toBe('neutral');
    expect(result.reason).toContain('資料不足');
  });

  test('剛好等於近期低點視為創新低（哭臉）', () => {
    // 前 5 筆低點是 90，今天收在剛好等於前低的 90
    const result = classifyTrend(closesToHistory([100, 95, 92, 91, 90, 90]), config);
    expect(result.face).toBe('cry');
  });

  test('創近期新低時判斷為哭臉，持續破底', () => {
    const result = classifyTrend(closesToHistory([100, 95, 92, 91, 90, 85]), config);
    expect(result.face).toBe('cry');
    expect(result.reason).toContain('破底');
  });

  test('離開低點且連續上漲確認天數時判斷為笑臉', () => {
    // 前 5 筆低點是 90，之後連續兩天收高：93 -> 95
    const result = classifyTrend(closesToHistory([100, 95, 92, 91, 90, 93, 95]), config);
    expect(result.face).toBe('smile');
    expect(result.reason).toContain('止穩反彈');
  });

  test('離開低點但還沒連續上漲夠天數時判斷為中性', () => {
    // 93 -> 92 不是連續上漲
    const result = classifyTrend(closesToHistory([100, 95, 92, 91, 90, 93, 92]), config);
    expect(result.face).toBe('neutral');
    expect(result.reason).not.toContain('資料不足');
  });

  test('lookbackDays 不是正整數時丟出明確錯誤', () => {
    expect(() =>
      classifyTrend(closesToHistory([100, 99, 98]), { lookbackDays: 0, confirmDays: 2 }),
    ).toThrow();
  });

  test('config 型別不正確時丟出明確錯誤', () => {
    expect(() =>
      classifyTrend(closesToHistory([100, 99, 98]), { lookbackDays: 'five' } as never),
    ).toThrow();
  });
});
