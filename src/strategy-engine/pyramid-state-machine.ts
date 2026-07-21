import type { PricePoint } from './types';

/**
 * 金字塔加碼滾動式策略——市場狀態機。
 * 完整規格見 docs/pyramid-state-machine-spec.md，此檔案為規格的直接實作。
 *
 * 與其他策略最大的差異：這是「有狀態」策略，介面為
 * (history, config, prevState) → { signal, nextState }，
 * 狀態進、狀態出，函式本身仍是純函式；PyramidState 的持久化由呼叫端負責。
 */

export type MarketState =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'CONSOLIDATION'
  | 'BREAKOUT_UP'
  | 'BREAKOUT_DOWN';

export type PyramidAction = 'add' | 'exit' | 'freeze' | 'hold' | 'insufficient_data';

export interface PyramidConfig {
  /** 起始成本（第 0 級部位的進場價） */
  entryPrice: number;
  /** 總預算，涵蓋起始部位；各級金額 = budget × weights[n] / sum(weights) */
  budget: number;
  /** 金字塔權重，weights[0] 為起始部位，weights[1..] 為各級加碼 */
  weights: number[];
  maShort: number;
  maLong: number;
  /** 均線糾結門檻（%），|短MA−長MA|/長MA 小於此值算一票盤整 */
  maConvergePct: number;
  /** 區間高低點回看天數，也是突破均量的計算窗口 */
  consolidationLookback: number;
  /** 區間振幅門檻（%），(高−低)/低 小於此值算一票盤整 */
  rangeNarrowPct: number;
  /** ATR 收縮門檻，近期 ATR < 前一期 ATR × 此值算一票盤整 */
  atrShrinkRatio: number;
  /** ATR 週期（規格預設 14，測試時可縮小） */
  atrPeriod: number;
  /** 狀態切換需連續一致的天數（BREAKOUT 豁免） */
  stateConfirmDays: number;
  /** 突破時量能需達均量的倍數 */
  volumeConfirmRatio: number;
  /** 價格已出區間但量能未確認時，最多等待的天數，逾期打回盤整 */
  breakoutConfirmDays: number;
  /** 盤整時移動停損緩衝（%），停損上移至上次加碼價 × (1 − 此值%) */
  stopBufferPct: number;
  /** 趨勢中停損跟隨短均線的緩衝（%） */
  trailMaBufferPct: number;
  /** 相對上一次加碼價的加碼觸發漲幅（%） */
  addTriggerPct: number;
}

export const DEFAULT_PYRAMID_PARAMS = {
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
} as const;

export interface PyramidState {
  currentState: MarketState;
  candidateState: MarketState | null;
  candidateDays: number;
  /** 已加碼到第幾級，0 = 只有起始部位 */
  currentTier: number;
  /** 上一次加碼價，第 0 級時等於 entryPrice */
  lastAddPrice: number;
  /** 目前移動停損價，只上移不下移 */
  stopPrice: number;
  /** 量能待確認計數，0 = 無待確認突破 */
  breakoutPendingDays: number;
  /** 進入盤整時鎖定的區間邊界，非盤整期間為 null */
  rangeHigh: number | null;
  rangeLow: number | null;
}

export interface PyramidSignal {
  triggered: boolean;
  action: PyramidAction;
  reason: string;
  /** action 為 add 時：本次加碼是第幾級（1 起算） */
  tierIndex?: number;
  /** action 為 add 時：建議投入金額 */
  amount?: number;
  state: MarketState;
  stopPrice: number;
}

export interface PyramidResult {
  signal: PyramidSignal;
  nextState: PyramidState;
}

function isPyramidConfig(config: unknown): config is PyramidConfig {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  const numberKeys = [
    'entryPrice',
    'budget',
    'maShort',
    'maLong',
    'maConvergePct',
    'consolidationLookback',
    'rangeNarrowPct',
    'atrShrinkRatio',
    'atrPeriod',
    'stateConfirmDays',
    'volumeConfirmRatio',
    'breakoutConfirmDays',
    'stopBufferPct',
    'trailMaBufferPct',
    'addTriggerPct',
  ];
  if (!numberKeys.every((k) => typeof c[k] === 'number')) return false;
  return Array.isArray(c.weights) && c.weights.every((w) => typeof w === 'number');
}

function validateConfig(config: PyramidConfig): void {
  if (!(config.entryPrice > 0)) throw new Error('pyramid: entryPrice 必須大於 0');
  if (!(config.budget > 0)) throw new Error('pyramid: budget 必須大於 0');
  if (config.weights.length < 2 || config.weights.some((w) => !(w > 0))) {
    throw new Error('pyramid: weights 至少要有 2 個大於 0 的權重（起始部位 + 至少一級加碼）');
  }
  const intKeys: (keyof PyramidConfig)[] = [
    'maShort',
    'maLong',
    'consolidationLookback',
    'atrPeriod',
    'stateConfirmDays',
    'breakoutConfirmDays',
  ];
  for (const key of intKeys) {
    const v = config[key] as number;
    if (!Number.isInteger(v) || v < 1) {
      throw new Error(`pyramid: ${key} 必須是大於等於 1 的整數`);
    }
  }
  if (!(config.maShort < config.maLong)) {
    throw new Error('pyramid: maShort 必須小於 maLong');
  }
  const positiveKeys: (keyof PyramidConfig)[] = [
    'maConvergePct',
    'rangeNarrowPct',
    'atrShrinkRatio',
    'volumeConfirmRatio',
    'stopBufferPct',
    'trailMaBufferPct',
    'addTriggerPct',
  ];
  for (const key of positiveKeys) {
    if (!((config[key] as number) > 0)) {
      throw new Error(`pyramid: ${key} 必須大於 0`);
    }
  }
}

function sma(values: number[], period: number): number {
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    sum += values[i];
  }
  return sum / period;
}

/** ATR：TR 的簡單平均。endOffset = 0 算最近一期，= atrPeriod 算前一期。 */
function atr(history: PricePoint[], period: number, endOffset: number): number {
  const end = history.length - endOffset;
  let sum = 0;
  for (let i = end - period; i < end; i += 1) {
    const prevClose = history[i - 1].close;
    const tr = Math.max(
      history[i].high - history[i].low,
      Math.abs(history[i].high - prevClose),
      Math.abs(history[i].low - prevClose),
    );
    sum += tr;
  }
  return sum / period;
}

interface RangeBounds {
  high: number;
  low: number;
}

function lookbackRange(history: PricePoint[], lookback: number): RangeBounds {
  let high = -Infinity;
  let low = Infinity;
  for (let i = history.length - lookback; i < history.length; i += 1) {
    if (history[i].high > high) high = history[i].high;
    if (history[i].low < low) low = history[i].low;
  }
  return { high, low };
}

/** 突破量能比對用的均量：取「今天以外」最近 lookback 天的平均成交量 */
function avgVolumeBeforeToday(history: PricePoint[], lookback: number): number {
  let sum = 0;
  const end = history.length - 1;
  for (let i = end - lookback; i < end; i += 1) {
    sum += history[i].volume;
  }
  return sum / lookback;
}

/**
 * 每根 bar 的原始狀態判斷（未經確認天數過濾）。
 * 盤整採三取二多數決，且優先於趨勢判斷——均線糾結時趨勢方向本來就不可靠。
 * 三項條件與趨勢條件都不成立時回傳 null（狀態不明，維持前一個已確認狀態）。
 */
function classifyRaw(history: PricePoint[], config: PyramidConfig): MarketState | null {
  const closes = history.map((p) => p.close);
  const close = closes[closes.length - 1];
  const maShort = sma(closes, config.maShort);
  const maLong = sma(closes, config.maLong);

  let consolidationVotes = 0;
  if ((Math.abs(maShort - maLong) / maLong) * 100 < config.maConvergePct) {
    consolidationVotes += 1;
  }
  const range = lookbackRange(history, config.consolidationLookback);
  if (((range.high - range.low) / range.low) * 100 < config.rangeNarrowPct) {
    consolidationVotes += 1;
  }
  const atrRecent = atr(history, config.atrPeriod, 0);
  const atrPrev = atr(history, config.atrPeriod, config.atrPeriod);
  if (atrRecent < atrPrev * config.atrShrinkRatio) {
    consolidationVotes += 1;
  }
  if (consolidationVotes >= 2) return 'CONSOLIDATION';

  if (maShort > maLong && close > maShort) return 'TRENDING_UP';
  if (maShort < maLong && close < maShort) return 'TRENDING_DOWN';
  return null;
}

function minRequiredBars(config: PyramidConfig): number {
  // 長均線、盤整區間回看、ATR 前後兩期比較（含 TR 需要的前一日收盤）取最大
  return Math.max(config.maLong, config.consolidationLookback, config.atrPeriod * 2 + 1);
}

function initialState(config: PyramidConfig, raw: MarketState | null): PyramidState {
  const state: PyramidState = {
    // 狀態不明時以 CONSOLIDATION（凍結加碼）起手，寧可保守
    currentState: raw ?? 'CONSOLIDATION',
    candidateState: null,
    candidateDays: 0,
    currentTier: 0,
    lastAddPrice: config.entryPrice,
    stopPrice: config.entryPrice * (1 - config.stopBufferPct / 100),
    breakoutPendingDays: 0,
    rangeHigh: null,
    rangeLow: null,
  };
  return state;
}

function tierAmount(config: PyramidConfig, tier: number): number {
  const weightSum = config.weights.reduce((acc, w) => acc + w, 0);
  return (config.budget * config.weights[tier]) / weightSum;
}

export function evaluatePyramid(
  history: PricePoint[],
  config: unknown,
  prevState?: PyramidState,
): PyramidResult {
  if (!isPyramidConfig(config)) {
    throw new Error('pyramid: config 格式不正確，缺少必要欄位（見 PyramidConfig 定義）');
  }
  validateConfig(config);

  const minRequired = minRequiredBars(config);
  if (history.length < minRequired) {
    const nextState = prevState ?? initialState(config, null);
    return {
      signal: {
        triggered: false,
        action: 'insufficient_data',
        reason: `資料不足：狀態判斷需要至少 ${minRequired} 筆價格資料，目前只有 ${history.length} 筆`,
        state: nextState.currentState,
        stopPrice: nextState.stopPrice,
      },
      nextState,
    };
  }

  const raw = classifyRaw(history, config);
  const bar = history[history.length - 1];
  const close = bar.close;
  const next: PyramidState = prevState ? { ...prevState } : initialState(config, raw);

  if (!prevState && next.currentState === 'CONSOLIDATION') {
    const range = lookbackRange(history, config.consolidationLookback);
    next.rangeHigh = range.high;
    next.rangeLow = range.low;
  }

  // BREAKOUT 是一次性事件：前一根 bar 是突破，今天起交回一般狀態判斷（免確認天數）
  if (prevState?.currentState === 'BREAKOUT_UP' || prevState?.currentState === 'BREAKOUT_DOWN') {
    next.currentState =
      raw ?? (prevState.currentState === 'BREAKOUT_UP' ? 'TRENDING_UP' : 'TRENDING_DOWN');
    next.candidateState = null;
    next.candidateDays = 0;
    if (next.currentState === 'CONSOLIDATION') {
      const range = lookbackRange(history, config.consolidationLookback);
      next.rangeHigh = range.high;
      next.rangeLow = range.low;
    } else {
      next.rangeHigh = null;
      next.rangeLow = null;
    }
  }

  let breakoutFiredThisBar = false;

  // 盤整期間先檢查突破（突破豁免確認天數，量能不足時進入待確認倒數）
  if (
    next.currentState === 'CONSOLIDATION' &&
    prevState !== undefined &&
    next.rangeHigh !== null &&
    next.rangeLow !== null
  ) {
    const outsideUp = close > next.rangeHigh;
    const outsideDown = close < next.rangeLow;
    if (outsideUp || outsideDown) {
      const avgVol = avgVolumeBeforeToday(history, config.consolidationLookback);
      if (bar.volume >= avgVol * config.volumeConfirmRatio) {
        next.currentState = outsideUp ? 'BREAKOUT_UP' : 'BREAKOUT_DOWN';
        next.breakoutPendingDays = 0;
        next.candidateState = null;
        next.candidateDays = 0;
        breakoutFiredThisBar = true;
      } else {
        next.breakoutPendingDays += 1;
        if (next.breakoutPendingDays > config.breakoutConfirmDays) {
          // 逾期未獲量能確認，視為假突破，打回盤整並歸零計數
          next.breakoutPendingDays = 0;
        }
      }
    } else {
      next.breakoutPendingDays = 0;
    }
  }

  // 一般狀態切換：候選狀態需連續 stateConfirmDays 天一致才正式切換
  if (!breakoutFiredThisBar && next.currentState !== 'BREAKOUT_UP' && next.currentState !== 'BREAKOUT_DOWN') {
    if (raw !== null && raw !== next.currentState) {
      if (next.candidateState === raw) {
        next.candidateDays += 1;
      } else {
        next.candidateState = raw;
        next.candidateDays = 1;
      }
      if (next.candidateDays >= config.stateConfirmDays) {
        next.currentState = raw;
        next.candidateState = null;
        next.candidateDays = 0;
        next.breakoutPendingDays = 0;
        if (raw === 'CONSOLIDATION') {
          const range = lookbackRange(history, config.consolidationLookback);
          next.rangeHigh = range.high;
          next.rangeLow = range.low;
        } else {
          next.rangeHigh = null;
          next.rangeLow = null;
        }
      }
    } else {
      next.candidateState = null;
      next.candidateDays = 0;
    }
  }

  // 移動停損：只上移不下移（棘輪式）
  if (next.currentState === 'TRENDING_UP' || next.currentState === 'BREAKOUT_UP') {
    const closes = history.map((p) => p.close);
    const maShortValue = sma(closes, config.maShort);
    next.stopPrice = Math.max(next.stopPrice, maShortValue * (1 - config.trailMaBufferPct / 100));
  } else if (next.currentState === 'CONSOLIDATION') {
    next.stopPrice = Math.max(next.stopPrice, next.lastAddPrice * (1 - config.stopBufferPct / 100));
  }

  const stateLabel = `狀態 ${next.currentState}`;
  const maxTier = config.weights.length - 1;

  // 行為分派
  if (next.currentState === 'BREAKOUT_UP' || next.currentState === 'TRENDING_UP') {
    const isBreakout = next.currentState === 'BREAKOUT_UP';
    const addTriggerPrice = next.lastAddPrice * (1 + config.addTriggerPct / 100);
    const shouldAdd = isBreakout || close >= addTriggerPrice;
    if (shouldAdd) {
      if (next.currentTier >= maxTier) {
        return {
          signal: {
            triggered: false,
            action: 'hold',
            reason: `${stateLabel}：加碼條件成立，但 ${maxTier} 級加碼檔位已用完，僅續抱`,
            state: next.currentState,
            stopPrice: next.stopPrice,
          },
          nextState: next,
        };
      }
      const tier = next.currentTier + 1;
      const amount = tierAmount(config, tier);
      next.currentTier = tier;
      next.lastAddPrice = close;
      const trigger = isBreakout
        ? `盤整區間向上突破且量能達標`
        : `目前價格 ${close} 已達上一次加碼價的加碼門檻 ${addTriggerPrice.toFixed(2)}`;
      return {
        signal: {
          triggered: true,
          action: 'add',
          reason: `${stateLabel}：${trigger}，觸發第 ${tier} 級加碼，建議投入約 ${amount.toFixed(0)} 元，停損上移至 ${next.stopPrice.toFixed(2)}`,
          tierIndex: tier,
          amount,
          state: next.currentState,
          stopPrice: next.stopPrice,
        },
        nextState: next,
      };
    }
    return {
      signal: {
        triggered: false,
        action: 'hold',
        reason: `${stateLabel}：目前價格 ${close} 尚未達加碼門檻 ${addTriggerPrice.toFixed(2)}，續抱並維持停損 ${next.stopPrice.toFixed(2)}`,
        state: next.currentState,
        stopPrice: next.stopPrice,
      },
      nextState: next,
    };
  }

  if (next.currentState === 'TRENDING_DOWN' || next.currentState === 'BREAKOUT_DOWN') {
    if (close <= next.stopPrice) {
      return {
        signal: {
          triggered: true,
          action: 'exit',
          reason: `${stateLabel}：目前價格 ${close} 已跌破移動停損 ${next.stopPrice.toFixed(2)}，建議出場或減碼`,
          state: next.currentState,
          stopPrice: next.stopPrice,
        },
        nextState: next,
      };
    }
    return {
      signal: {
        triggered: false,
        action: 'hold',
        reason: `${stateLabel}：停止加碼，目前價格 ${close} 尚未跌破移動停損 ${next.stopPrice.toFixed(2)}`,
        state: next.currentState,
        stopPrice: next.stopPrice,
      },
      nextState: next,
    };
  }

  const pendingNote =
    next.breakoutPendingDays > 0
      ? `，價格已出區間但量能未確認（待確認第 ${next.breakoutPendingDays} 天，逾 ${config.breakoutConfirmDays} 天視為假突破）`
      : '';
  return {
    signal: {
      triggered: false,
      action: 'freeze',
      reason: `${stateLabel}：凍結加碼，停損維持 ${next.stopPrice.toFixed(2)}${pendingNote}`,
      state: next.currentState,
      stopPrice: next.stopPrice,
    },
    nextState: next,
  };
}
