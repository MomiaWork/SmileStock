import { routeRecommendation } from '../recommendation-router';
import type { GridStrategyConfig } from '../grid-strategy';
import type { PyramidConfig, PyramidState } from '../pyramid-state-machine';
import type { PricePoint } from '../types';

/**
 * 縮小參數，跟 pyramid-state-machine.test.ts 共用同一組設計：
 * 均線 3/5、ATR 週期 3、回看 5 天，最少資料量 = max(5, 5, 3*2+1) = 7 筆。
 */
const basePyramidConfig: PyramidConfig = {
  entryPrice: 100,
  budget: 45000,
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
};

const gridConfig: { type: 'grid'; params: GridStrategyConfig } = {
  type: 'grid',
  params: { anchorPrice: 105, budget: 30000, spacingPercent: 1, tierCount: 3 },
};

function bars(closes: number[], volumes?: number[]): PricePoint[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    close,
    high: close + 1,
    low: close - 1,
    volume: volumes?.[i] ?? 1000,
  }));
}

function makeState(overrides: Partial<PyramidState>): PyramidState {
  return {
    currentState: 'TRENDING_UP',
    candidateState: null,
    candidateDays: 0,
    currentTier: 0,
    lastAddPrice: 100,
    stopPrice: 90,
    breakoutPendingDays: 0,
    rangeHigh: null,
    rangeLow: null,
    ...overrides,
  };
}

const flatCloses = [100, 100, 100, 100, 100, 100, 100];
const risingCloses = [100, 104, 108, 112, 116, 120, 126];
const fallingCloses = [120, 115, 110, 105, 100, 95, 90];

describe('routeRecommendation', () => {
  it('兩個策略都沒開時回傳 null，交給呼叫端維持原本顯示', () => {
    expect(routeRecommendation(bars(flatCloses), null, null, undefined)).toBeNull();
  });

  it('只開網格時直接透傳網格建議，regime 為 null', () => {
    const result = routeRecommendation(bars(flatCloses), gridConfig, null, undefined);
    expect(result?.source).toBe('grid');
    expect(result?.regime).toBeNull();
  });

  it('只開金字塔時直接透傳金字塔訊號，regime 為 null', () => {
    const result = routeRecommendation(bars(flatCloses), null, basePyramidConfig, undefined);
    expect(result?.source).toBe('pyramid');
    expect(result?.regime).toBeNull();
    expect(result?.action).toBe('freeze');
  });

  it('盤整（三取二成立）→ 依網格建議，regime 標示為盤整', () => {
    const result = routeRecommendation(bars(flatCloses), gridConfig, basePyramidConfig, undefined);
    expect(result?.source).toBe('grid');
    expect(result?.regime).toBe('CONSOLIDATION');
    // 現價 100，anchorPrice 105、間距 1% → 第 3 檔門檻 101.85，跌破三檔
    expect(result?.reason).toContain('第 3 檔門檻');
    expect(result?.reason).toContain('盤整');
  });

  it('上升趨勢且達加碼門檻 → 依金字塔加碼建議，regime 標示為上升趨勢', () => {
    const config = { ...basePyramidConfig, addTriggerPct: 50 };
    const prev = makeState({ lastAddPrice: 84 });
    const result = routeRecommendation(bars(risingCloses), gridConfig, config, prev);
    expect(result?.source).toBe('pyramid');
    expect(result?.regime).toBe('TRENDING_UP');
    expect(result?.action).toBe('add');
    expect(result?.tierIndex).toBe(1);
    expect(result?.amount).toBeCloseTo(15000);
    expect(result?.reason).toContain('上升趨勢');
  });

  it('下降趨勢但尚未跌破停損 → 兩策略都不建議投入新資金', () => {
    const prev = makeState({ currentState: 'TRENDING_DOWN', stopPrice: 85 });
    const result = routeRecommendation(bars(fallingCloses), gridConfig, basePyramidConfig, prev);
    expect(result?.source).toBe('pyramid');
    expect(result?.regime).toBe('TRENDING_DOWN');
    expect(result?.action).toBe('wait');
    expect(result?.reason).toContain('不建議投入新資金');
  });

  it('跌破移動停損觸發出場 → 不論網格是否也有訊號，優先顯示出場', () => {
    // 現價 90 同時也跌破網格三檔門檻（101.85），但金字塔已觸發出場，出場優先於網格建議
    const prev = makeState({ currentState: 'TRENDING_DOWN', stopPrice: 92 });
    const result = routeRecommendation(bars(fallingCloses), gridConfig, basePyramidConfig, prev);
    expect(result?.source).toBe('pyramid');
    expect(result?.action).toBe('exit');
    expect(result?.reason).toContain('優先出場');
    expect(result?.reason).toContain('跌破移動停損');
  });

  it('金字塔資料不足時，暫時退回依網格建議並註明原因', () => {
    const result = routeRecommendation(
      bars(flatCloses.slice(0, 6)),
      gridConfig,
      basePyramidConfig,
      undefined,
    );
    expect(result?.source).toBe('grid');
    expect(result?.regime).toBeNull();
    expect(result?.reason).toContain('趨勢研判資料還在累積中');
  });

  it('金字塔有啟用時（不論路由結果聽誰的）一律回傳推進後的 pyramidNextState 供呼叫端持久化', () => {
    // 路由到網格（盤整）時金字塔狀態仍要推進，否則狀態機會停在舊狀態
    const routedToGrid = routeRecommendation(
      bars(flatCloses),
      gridConfig,
      basePyramidConfig,
      undefined,
    );
    expect(routedToGrid?.source).toBe('grid');
    expect(routedToGrid?.pyramidNextState).toBeDefined();

    const pyramidOnly = routeRecommendation(bars(flatCloses), null, basePyramidConfig, undefined);
    expect(pyramidOnly?.pyramidNextState).toBeDefined();

    const gridOnly = routeRecommendation(bars(flatCloses), gridConfig, null, undefined);
    expect(gridOnly?.pyramidNextState).toBeUndefined();
  });
});
