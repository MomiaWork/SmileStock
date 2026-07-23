import { runPyramidBacktest, type PyramidBacktestParams } from '../pyramid-backtest';
import type { PricePoint } from '../types';

function bars(closes: number[]): PricePoint[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    close,
    high: close + 1,
    low: close - 1,
    volume: 1000,
  }));
}

/** 縮小版分類參數（比照 pyramid-state-machine.test.ts 的 baseConfig），最少資料量 = 7 筆 */
const baseParams: PyramidBacktestParams = {
  weights: [1, 1.5, 2],
  maShort: 3,
  maLong: 5,
  maConvergePct: 2,
  consolidationLookback: 5,
  rangeNarrowPct: 7,
  atrShrinkRatio: 0.8,
  atrPeriod: 3,
  stateConfirmDays: 2,
  volumeConfirmRatio: 1.2,
  breakoutConfirmDays: 2,
  stopBufferPct: 4,
  trailMaBufferPct: 2,
  addTriggerPct: 5,
  hardStopPct: 30,
};

describe('runPyramidBacktest', () => {
  test('完全沒有資料時回傳全 0 結果，不噴錯', () => {
    const result = runPyramidBacktest([], baseParams, 45000);
    expect(result).toEqual({ totalReturnPercent: 0, maxDrawdownPercent: 0, tradeCount: 0 });
  });

  test('資料筆數全程不足時，從未進場，回傳全 0 結果', () => {
    const result = runPyramidBacktest(bars(Array(5).fill(100)), baseParams, 45000);
    expect(result).toEqual({ totalReturnPercent: 0, maxDrawdownPercent: 0, tradeCount: 0 });
  });

  test('進場、兩級加碼、趨勢反轉觸發移動停損出場：驗證交易次數與損益計算', () => {
    // 暖身7天(100，盤整) -> 進場買起始部位(weights[0]=1/4.5) -> 上漲觸發兩級加碼用完檔位
    // -> 高點140後反轉下跌，跌破棘輪移動停損 -> 出場
    const closes = [
      ...Array(7).fill(100),
      104, 108, 112, 116, 120, 126, 132, 140,
      130, 120, 110, 100,
    ];
    const result = runPyramidBacktest(bars(closes), baseParams, 45000);
    // 進場(day6@100) + 第1級加碼(day9@112) + 第2級加碼(day11@120) + 出場(day18@100) = 4筆
    expect(result.tradeCount).toBe(4);
    // 起始部位10000股數100 + 15000/112 + 20000/120 賣在100元的總損益
    expect(result.totalReturnPercent).toBeCloseTo(-10.98, 1);
    expect(result.maxDrawdownPercent).toBeCloseTo(28.57, 1);
  });

  test('跌破硬停損時無條件出場，不論戰術移動停損是否已觸發', () => {
    // 暖身7天(100，盤整)進場後隔天直接崩跌到硬停損水位(100*(1-30%)=70)以下
    const closes = [...Array(7).fill(100), 65];
    const result = runPyramidBacktest(bars(closes), baseParams, 45000);
    // 進場(day6@100) + 硬停損出場(day7@65) = 2筆
    expect(result.tradeCount).toBe(2);
    // 起始部位100股 @100元進場、65元出場：損益 = 100*(65-100) = -3500，占預算45000 ≈ -7.78%
    expect(result.totalReturnPercent).toBeCloseTo(-7.78, 1);
  });

  test('進場後全程盤整凍結、從未加碼也未出場：只有進場一筆交易', () => {
    const result = runPyramidBacktest(bars(Array(20).fill(100)), baseParams, 45000);
    expect(result.tradeCount).toBe(1);
    expect(result.totalReturnPercent).toBeCloseTo(0, 5);
  });

  test('出場後遇到新一波確認的上升趨勢會重新進場（多輪），而不是出場就永遠留在現金', () => {
    // 沿用上面「進場、兩級加碼、反轉出場」的第一輪(day0~18)，出場後接著盤整3天，
    // 再接一段乾淨的上漲，重新確認 TRENDING_UP 後應該要重新進場並再加碼一次
    const closes = [
      ...Array(7).fill(100),
      104, 108, 112, 116, 120, 126, 132, 140,
      130, 120, 110, 100, // 第一輪：進場@100 -> 兩級加碼 -> 出場@100 (day18)
      100, 100, 100, // 出場後盤整，還不能重新進場
      105, 110, 115, 120, // 重新確認上升趨勢 -> day23 重新進場 -> day25 第1級加碼
    ];
    const result = runPyramidBacktest(bars(closes), baseParams, 45000);
    // 第一輪：進場+加碼+加碼+出場 = 4筆；第二輪：進場+加碼 = 2筆 -> 共6筆
    expect(result.tradeCount).toBe(6);
    expect(result.totalReturnPercent).toBeCloseTo(-8.96, 1);
    expect(result.maxDrawdownPercent).toBeCloseTo(28.57, 1);
  });

  test('尚未確認新一波上升趨勢前（仍是盤整或轉空）不會重新進場', () => {
    // 出場後只有盤整、沒有接上升趨勢：不應該重新進場，資金全程停留在現金
    const closes = [
      ...Array(7).fill(100),
      104, 108, 112, 116, 120, 126, 132, 140,
      130, 120, 110, 100, // 第一輪出場 @100 (day18)
      ...Array(10).fill(100), // 出場後持續盤整，沒有新趨勢，不重新進場
    ];
    const result = runPyramidBacktest(bars(closes), baseParams, 45000);
    expect(result.tradeCount).toBe(4); // 只有第一輪的進場+加碼+加碼+出場
  });
});
