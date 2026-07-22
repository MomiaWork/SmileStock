import { adviseEntry } from '../entry-advisor';
import type { GridStrategyConfig } from '../grid-strategy';
import type { MaCrossStrategyConfig } from '../ma-cross-strategy';
import type { RsiStrategyConfig } from '../rsi-strategy';
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

const rsiConfig: RsiStrategyConfig = { period: 4, threshold: 40 };
const maCrossConfig: MaCrossStrategyConfig = { shortPeriod: 2, longPeriod: 4 };

const trendConfig = { lookbackDays: 5, confirmDays: 2 };

describe('adviseEntry', () => {
  test('網格尚未觸發時回傳 no_signal', () => {
    const advice = adviseEntry(
      closesToHistory([100, 100, 100, 100, 100, 100, 100]),
      { type: 'grid', params: gridConfig },
      { trendConfig },
    );
    expect(advice.action).toBe('no_signal');
    expect(advice.amount).toBeUndefined();
  });

  test('網格觸發但趨勢仍破底（哭臉）時建議觀望，不給投入金額', () => {
    // 觸發第 1 檔（<=95），且最後一筆創新低
    const advice = adviseEntry(
      closesToHistory([120, 110, 105, 100, 96, 94]),
      { type: 'grid', params: gridConfig },
      { trendConfig },
    );
    expect(advice.action).toBe('wait');
    expect(advice.amount).toBeUndefined();
    expect(advice.reason).toContain('觀望');
  });

  test('網格觸發且趨勢確認止穩反彈（笑臉）時建議進場並給出投入金額', () => {
    // 前低 86（已跌破第 2 檔門檻 90），之後連續兩天收高 87 -> 89
    const advice = adviseEntry(
      closesToHistory([120, 110, 100, 95, 90, 86, 87, 89]),
      { type: 'grid', params: gridConfig },
      { trendConfig },
    );
    expect(advice.action).toBe('enter');
    expect(advice.amount).toBeGreaterThan(0);
    expect(advice.tierIndex).toBe(2);
  });

  test('網格觸發但趨勢中性（尚未確認）時建議觀望', () => {
    // 離開低點但沒有連續上漲
    const advice = adviseEntry(
      closesToHistory([120, 110, 100, 95, 90, 93, 92]),
      { type: 'grid', params: gridConfig },
      { trendConfig },
    );
    expect(advice.action).toBe('wait');
  });

  test('RSI 未觸發時回傳 no_signal', () => {
    const advice = adviseEntry(
      closesToHistory([100, 101, 102, 103, 104]),
      { type: 'rsi', params: rsiConfig },
      { trendConfig },
    );
    expect(advice.action).toBe('no_signal');
  });

  test('RSI 觸發但趨勢仍破底（哭臉）時建議觀望，不給投入金額', () => {
    // 持續下跌把 RSI 壓到門檻以下，且最後一筆創新低
    const advice = adviseEntry(
      closesToHistory([120, 110, 105, 100, 96, 94]),
      { type: 'rsi', params: rsiConfig },
      { trendConfig },
    );
    expect(advice.action).toBe('wait');
    expect(advice.amount).toBeUndefined();
    expect(advice.reason).toContain('觀望');
  });

  test('RSI 觸發且趨勢確認止穩反彈（笑臉）時建議進場，RSI 沒有金額概念維持 undefined', () => {
    const advice = adviseEntry(
      closesToHistory([120, 110, 100, 95, 90, 86, 87, 89]),
      { type: 'rsi', params: rsiConfig },
      { trendConfig },
    );
    expect(advice.action).toBe('enter');
    expect(advice.amount).toBeUndefined();
    expect(advice.reason).toContain('進場');
  });

  test('均線交叉觸發且趨勢確認止穩反彈（笑臉）時建議進場', () => {
    // 短均線(2)在最後一天黃金交叉長均線(4)，且離開低點後連續收高
    const advice = adviseEntry(
      closesToHistory([100, 95, 88, 80, 78, 85, 100]),
      { type: 'ma_cross', params: maCrossConfig },
      { trendConfig },
    );
    expect(advice.action).toBe('enter');
    expect(advice.amount).toBeUndefined();
  });

  describe('momentumConfirmEnabled', () => {
    // 21 天溫和下跌到跌破網格第 1 檔（95），最後 3 天連續收高確認止穩，
    // 但 RSI(14) 約 40（未超賣）、均線也沒有黃金交叉 -> 動能確認濾網不通過
    const noMomentumCloses = [
      100, 100, 99, 100, 98, 99, 97, 98, 96, 97, 95, 96, 94, 95, 93, 94, 92, 91, 92, 93, 94,
    ];
    // 先深跌讓 RSI 探底，接一段走平讓長均線跟上，最後 2 天收高確認止穩 -> RSI 深度超賣，動能確認通過
    const momentumConfirmedCloses = [
      ...Array.from({ length: 15 }, (_, i) => 200 - i * 10),
      ...Array.from({ length: 18 }, () => 60),
      63,
      66,
    ];

    test('關閉時（預設）即使動能訊號不足，行為跟現在一樣直接 enter', () => {
      const advice = adviseEntry(
        closesToHistory(noMomentumCloses),
        { type: 'grid', params: gridConfig },
        { trendConfig },
      );
      expect(advice.action).toBe('enter');
    });

    test('開啟後，趨勢已確認但動能訊號不足時，降級為 wait', () => {
      const advice = adviseEntry(
        closesToHistory(noMomentumCloses),
        { type: 'grid', params: gridConfig },
        { trendConfig, momentumConfirmEnabled: true },
      );
      expect(advice.action).toBe('wait');
      expect(advice.reason).toContain('動能');
    });

    test('開啟後，趨勢與動能都確認時才 enter', () => {
      const advice = adviseEntry(
        closesToHistory(momentumConfirmedCloses),
        { type: 'grid', params: gridConfig },
        { trendConfig, momentumConfirmEnabled: true },
      );
      expect(advice.action).toBe('enter');
    });
  });
});
