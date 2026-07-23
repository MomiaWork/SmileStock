import { evaluatePyramid, type PyramidConfig, type PyramidState } from '../pyramid-state-machine';
import type { PricePoint } from '../types';

/**
 * 測試用縮小參數：均線 3/5、ATR 週期 3、回看 5 天，
 * 最少資料量 = max(5, 5, 3*2+1) = 7 筆。
 * 權重 [1, 1.5, 2]、預算 45000 → 單位 = 45000 / 4.5 = 10000，
 * 第 1 級加碼 15000、第 2 級 20000，最多 2 級加碼。
 */
const baseConfig: PyramidConfig = {
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

// 明確上升趨勢：短均線 > 長均線、收盤價站上短均線、無盤整票
const risingCloses = [100, 104, 108, 112, 116, 120, 126];
// 明確下降趨勢
const fallingCloses = [120, 115, 110, 105, 100, 95, 90];
// 完全走平：均線糾結 + 區間收斂，三取二成立 → 盤整
const flatCloses = [100, 100, 100, 100, 100, 100, 100];

describe('pyramid-state-machine', () => {
  describe('config 驗證', () => {
    it('缺少欄位時丟出明確錯誤', () => {
      expect(() => evaluatePyramid(bars(flatCloses), { entryPrice: 100 })).toThrow(
        /config 格式不正確/,
      );
    });

    it('weights 只有一個權重（沒有加碼級距）時丟出錯誤', () => {
      expect(() => evaluatePyramid(bars(flatCloses), { ...baseConfig, weights: [1] })).toThrow(
        /weights/,
      );
    });

    it('maShort 大於等於 maLong 時丟出錯誤', () => {
      expect(() =>
        evaluatePyramid(bars(flatCloses), { ...baseConfig, maShort: 5, maLong: 5 }),
      ).toThrow(/maShort/);
    });
  });

  describe('資料不足', () => {
    it('筆數不足時回傳 insufficient_data，不硬算', () => {
      const { signal, nextState } = evaluatePyramid(bars(flatCloses.slice(0, 6)), baseConfig);
      expect(signal.triggered).toBe(false);
      expect(signal.action).toBe('insufficient_data');
      expect(signal.reason).toContain('資料不足');
      // 初始狀態以保守的 CONSOLIDATION 起手，停損 = entryPrice × (1 − 4%)
      expect(nextState.currentState).toBe('CONSOLIDATION');
      expect(nextState.stopPrice).toBeCloseTo(96);
    });
  });

  describe('狀態判斷', () => {
    it('走平序列三取二成立（均線糾結 + 區間收斂）→ 初始即為盤整並鎖定區間', () => {
      const { signal, nextState } = evaluatePyramid(bars(flatCloses), baseConfig);
      expect(nextState.currentState).toBe('CONSOLIDATION');
      expect(nextState.rangeHigh).toBe(101);
      expect(nextState.rangeLow).toBe(99);
      expect(signal.action).toBe('freeze');
      expect(signal.triggered).toBe(false);
    });

    it('原始判斷不明（無趨勢、盤整票不足）時維持前一個已確認狀態', () => {
      // 下跌後反彈：短均線 < 長均線但收盤站上短均線 → 趨勢不明，盤整票也不足
      const bounce = [120, 115, 110, 105, 100, 95, 103];
      const prev = makeState({ currentState: 'CONSOLIDATION', rangeHigh: 200, rangeLow: 50 });
      const { nextState } = evaluatePyramid(bars(bounce), baseConfig, prev);
      expect(nextState.currentState).toBe('CONSOLIDATION');
      expect(nextState.candidateState).toBeNull();
    });
  });

  describe('狀態切換確認天數', () => {
    it('原始判斷連續一致未滿確認天數前，不切換狀態', () => {
      const prev = makeState({ currentState: 'CONSOLIDATION', rangeHigh: 200, rangeLow: 50 });
      const { signal, nextState } = evaluatePyramid(bars(risingCloses), baseConfig, prev);
      expect(nextState.currentState).toBe('CONSOLIDATION');
      expect(nextState.candidateState).toBe('TRENDING_UP');
      expect(nextState.candidateDays).toBe(1);
      expect(signal.action).toBe('freeze');
    });

    it('連續滿確認天數後正式切換，並清除盤整區間', () => {
      const prev = makeState({
        currentState: 'CONSOLIDATION',
        candidateState: 'TRENDING_UP',
        candidateDays: 1,
        rangeHigh: 200,
        rangeLow: 50,
      });
      const { nextState } = evaluatePyramid(bars([...risingCloses, 130]), baseConfig, prev);
      expect(nextState.currentState).toBe('TRENDING_UP');
      expect(nextState.candidateState).toBeNull();
      expect(nextState.rangeHigh).toBeNull();
      expect(nextState.rangeLow).toBeNull();
    });
  });

  describe('TRENDING_UP 加碼', () => {
    it('現價剛好等於加碼門檻（上一次加碼價 × (1 + 觸發%)）時觸發加碼', () => {
      // 84 × (1 + 50%) = 126，剛好等於最後收盤價（選 50% 避免浮點誤差干擾邊界測試）
      const config = { ...baseConfig, addTriggerPct: 50 };
      const prev = makeState({ lastAddPrice: 84 });
      const { signal, nextState } = evaluatePyramid(bars(risingCloses), config, prev);
      expect(signal.triggered).toBe(true);
      expect(signal.action).toBe('add');
      expect(signal.tierIndex).toBe(1);
      expect(signal.amount).toBeCloseTo(15000);
      expect(nextState.currentTier).toBe(1);
      expect(nextState.lastAddPrice).toBe(126);
    });

    it('未達加碼門檻時續抱（hold），不觸發', () => {
      const prev = makeState({ lastAddPrice: 125 });
      const { signal, nextState } = evaluatePyramid(bars(risingCloses), baseConfig, prev);
      expect(signal.triggered).toBe(false);
      expect(signal.action).toBe('hold');
      expect(nextState.currentTier).toBe(0);
    });

    it('加碼檔位用完時只續抱，不再觸發加碼', () => {
      const config = { ...baseConfig, addTriggerPct: 50 };
      const prev = makeState({ lastAddPrice: 84, currentTier: 2 });
      const { signal } = evaluatePyramid(bars(risingCloses), config, prev);
      expect(signal.triggered).toBe(false);
      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('檔位已用完');
    });

    it('趨勢中停損棘輪式跟隨短均線，只上移', () => {
      // 短均線 = (116+120+126)/3 = 120.67，停損 = 120.67 × 0.98 ≈ 118.25
      const prevLow = makeState({ lastAddPrice: 125, stopPrice: 90 });
      const resultLow = evaluatePyramid(bars(risingCloses), baseConfig, prevLow);
      expect(resultLow.nextState.stopPrice).toBeCloseTo(118.25, 1);

      // 既有停損比均線算出來的高 → 維持不動，不下移
      const prevHigh = makeState({ lastAddPrice: 125, stopPrice: 125 });
      const resultHigh = evaluatePyramid(bars(risingCloses), baseConfig, prevHigh);
      expect(resultHigh.nextState.stopPrice).toBe(125);
    });
  });

  describe('盤整突破', () => {
    const consolidationPrev = () =>
      makeState({
        currentState: 'CONSOLIDATION',
        rangeHigh: 101,
        rangeLow: 99,
        stopPrice: 96,
      });

    it('收盤站上區間上緣且量能達標 → 立即 BREAKOUT_UP 並觸發加碼（豁免確認天數）', () => {
      const closes = [100, 100, 100, 100, 100, 100, 105];
      const volumes = [1000, 1000, 1000, 1000, 1000, 1000, 2000];
      const { signal, nextState } = evaluatePyramid(
        bars(closes, volumes),
        baseConfig,
        consolidationPrev(),
      );
      expect(nextState.currentState).toBe('BREAKOUT_UP');
      expect(signal.triggered).toBe(true);
      expect(signal.action).toBe('add');
      expect(signal.tierIndex).toBe(1);
      expect(nextState.lastAddPrice).toBe(105);
    });

    it('價格出區間但量能不足 → 進入待確認，維持盤整凍結', () => {
      const closes = [100, 100, 100, 100, 100, 100, 105];
      const { signal, nextState } = evaluatePyramid(bars(closes), baseConfig, consolidationPrev());
      expect(nextState.currentState).toBe('CONSOLIDATION');
      expect(nextState.breakoutPendingDays).toBe(1);
      expect(signal.action).toBe('freeze');
      expect(signal.reason).toContain('量能未確認');
    });

    it('待確認期間量能補上 → 當天觸發 BREAKOUT_UP', () => {
      const closes = [100, 100, 100, 100, 100, 100, 105, 105];
      const volumes = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 2000];
      const prev = { ...consolidationPrev(), breakoutPendingDays: 1 };
      const { signal, nextState } = evaluatePyramid(bars(closes, volumes), baseConfig, prev);
      expect(nextState.currentState).toBe('BREAKOUT_UP');
      expect(signal.action).toBe('add');
      expect(nextState.breakoutPendingDays).toBe(0);
    });

    it('逾期未獲量能確認 → 視為假突破，計數歸零並留在盤整', () => {
      // stateConfirmDays 調大，隔離一般狀態切換對此測試的干擾
      const config = { ...baseConfig, stateConfirmDays: 5 };
      const closes = [100, 100, 100, 100, 100, 100, 105, 105, 105];
      const prev = { ...consolidationPrev(), breakoutPendingDays: 2 };
      const { nextState } = evaluatePyramid(bars(closes), config, prev);
      expect(nextState.currentState).toBe('CONSOLIDATION');
      expect(nextState.breakoutPendingDays).toBe(0);
    });

    it('價格回到區間內 → 待確認計數歸零', () => {
      const closes = [100, 100, 100, 100, 100, 105, 100];
      const prev = { ...consolidationPrev(), breakoutPendingDays: 1 };
      const { nextState } = evaluatePyramid(bars(closes), baseConfig, prev);
      expect(nextState.breakoutPendingDays).toBe(0);
      expect(nextState.currentState).toBe('CONSOLIDATION');
    });
  });

  describe('BREAKOUT 是一次性事件', () => {
    it('突破後隔天交回一般狀態判斷（免確認天數），並清除區間', () => {
      const prev = makeState({
        currentState: 'BREAKOUT_UP',
        currentTier: 1,
        lastAddPrice: 126,
        stopPrice: 118,
        rangeHigh: 101,
        rangeLow: 99,
      });
      const { signal, nextState } = evaluatePyramid(bars(risingCloses), baseConfig, prev);
      expect(nextState.currentState).toBe('TRENDING_UP');
      expect(nextState.rangeHigh).toBeNull();
      expect(signal.action).toBe('hold');
    });
  });

  describe('盤整時的停損', () => {
    it('停損上移至上一次加碼價 × (1 − 緩衝%)，且不下移', () => {
      const prev = makeState({
        currentState: 'CONSOLIDATION',
        lastAddPrice: 110,
        stopPrice: 96,
        rangeHigh: 200,
        rangeLow: 50,
      });
      const { nextState } = evaluatePyramid(bars(flatCloses), baseConfig, prev);
      expect(nextState.stopPrice).toBeCloseTo(110 * 0.96);
    });
  });

  describe('TRENDING_DOWN / 出場', () => {
    it('下跌趨勢且收盤跌破移動停損 → 觸發出場', () => {
      const prev = makeState({ currentState: 'TRENDING_DOWN', stopPrice: 92 });
      const { signal } = evaluatePyramid(bars(fallingCloses), baseConfig, prev);
      expect(signal.triggered).toBe(true);
      expect(signal.action).toBe('exit');
      expect(signal.reason).toContain('跌破移動停損');
    });

    it('下跌趨勢但尚未跌破停損 → 停止加碼、續抱觀察', () => {
      const prev = makeState({ currentState: 'TRENDING_DOWN', stopPrice: 85 });
      const { signal } = evaluatePyramid(bars(fallingCloses), baseConfig, prev);
      expect(signal.triggered).toBe(false);
      expect(signal.action).toBe('hold');
    });
  });
});
