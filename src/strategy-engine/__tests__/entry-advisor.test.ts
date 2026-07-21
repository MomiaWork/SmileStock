import { adviseEntry } from '../entry-advisor';
import type { GridStrategyConfig } from '../grid-strategy';
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

const gridConfig: GridStrategyConfig = {
  anchorPrice: 100,
  budget: 10500,
  spacingPercent: 5,
  tierCount: 5,
};

const trendConfig = { lookbackDays: 5, confirmDays: 2 };

describe('adviseEntry', () => {
  test('網格尚未觸發時回傳 no_signal', () => {
    const advice = adviseEntry(
      closesToHistory([100, 100, 100, 100, 100, 100, 100]),
      gridConfig,
      trendConfig,
    );
    expect(advice.action).toBe('no_signal');
    expect(advice.amount).toBeUndefined();
  });

  test('網格觸發但趨勢仍破底（哭臉）時建議觀望，不給投入金額', () => {
    // 觸發第 1 檔（<=95），且最後一筆創新低
    const advice = adviseEntry(
      closesToHistory([120, 110, 105, 100, 96, 94]),
      gridConfig,
      trendConfig,
    );
    expect(advice.action).toBe('wait');
    expect(advice.amount).toBeUndefined();
    expect(advice.reason).toContain('觀望');
  });

  test('網格觸發且趨勢確認止穩反彈（笑臉）時建議進場並給出投入金額', () => {
    // 前低 86（已跌破第 2 檔門檻 90），之後連續兩天收高 87 -> 89
    const advice = adviseEntry(
      closesToHistory([120, 110, 100, 95, 90, 86, 87, 89]),
      gridConfig,
      trendConfig,
    );
    expect(advice.action).toBe('enter');
    expect(advice.amount).toBeGreaterThan(0);
    expect(advice.tierIndex).toBe(2);
  });

  test('網格觸發但趨勢中性（尚未確認）時建議觀望', () => {
    // 離開低點但沒有連續上漲
    const advice = adviseEntry(
      closesToHistory([120, 110, 100, 95, 90, 93, 92]),
      gridConfig,
      trendConfig,
    );
    expect(advice.action).toBe('wait');
  });
});
