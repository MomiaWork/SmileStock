import { reconcilePosition } from '../pyramid-reconciliation';
import type { PyramidConfig, PyramidState } from '../pyramid-state-machine';

const config: PyramidConfig = {
  entryPrice: 100,
  budget: 60000,
  weights: [1, 1, 2, 2], // weightSum = 6，累積至第 2 級 = (1+1+2)/6*60000 = 40000
  maShort: 20,
  maLong: 60,
  maConvergePct: 2,
  consolidationLookback: 20,
  rangeNarrowPct: 7,
  atrShrinkRatio: 0.8,
  atrPeriod: 14,
  stateConfirmDays: 2,
  volumeConfirmRatio: 1.2,
  breakoutConfirmDays: 3,
  stopBufferPct: 4,
  trailMaBufferPct: 2.5,
  addTriggerPct: 5,
};

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

describe('reconcilePosition', () => {
  test('currentTier 為 0（只有起始部位）時不檢查，一律回傳 null', () => {
    const state = makeState({ currentTier: 0 });
    expect(reconcilePosition(config, state, null)).toBeNull();
  });

  test('持倉成本與累積應投入金額一致時回傳 null', () => {
    // 第 2 級累積應投入 40000；持倉成本 40000 / 100 股 = 平均成本 400
    const state = makeState({ currentTier: 2 });
    const position = { quantity: 100, avgCost: 400 };
    expect(reconcilePosition(config, state, position)).toBeNull();
  });

  test('沒有任何持倉但狀態機記錄已加碼 → underfunded 落差', () => {
    const state = makeState({ currentTier: 2 });
    const result = reconcilePosition(config, state, null);
    expect(result?.status).toBe('underfunded');
    expect(result?.reason).toContain('第 2 級');
    expect(result?.reason).toContain('忘記記錄');
  });

  test('持倉成本明顯低於應投入金額（低於 50%）→ underfunded 落差', () => {
    // 應投入 40000，持倉只有 15000（37.5%）
    const state = makeState({ currentTier: 2 });
    const position = { quantity: 100, avgCost: 150 };
    const result = reconcilePosition(config, state, position);
    expect(result?.status).toBe('underfunded');
    expect(result?.expectedCostBasis).toBeCloseTo(40000);
    expect(result?.actualCostBasis).toBeCloseTo(15000);
  });

  test('持倉成本明顯高於應投入金額（高於 150%）→ overfunded 落差', () => {
    // 應投入 40000，持倉有 70000（175%）
    const state = makeState({ currentTier: 2 });
    const position = { quantity: 100, avgCost: 700 };
    const result = reconcilePosition(config, state, position);
    expect(result?.status).toBe('overfunded');
    expect(result?.reason).toContain('記錄之外的額外買進');
  });

  test('比例剛好落在門檻邊界內（50%~150%）時視為一致，不回報落差', () => {
    const state = makeState({ currentTier: 2 });
    const atLowerBound = { quantity: 100, avgCost: 200 }; // 20000 = 50%
    const atUpperBound = { quantity: 100, avgCost: 600 }; // 60000 = 150%
    expect(reconcilePosition(config, state, atLowerBound)).toBeNull();
    expect(reconcilePosition(config, state, atUpperBound)).toBeNull();
  });
});
