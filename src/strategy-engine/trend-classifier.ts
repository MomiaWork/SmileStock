import type { PricePoint } from './types';

export type TrendFace = 'smile' | 'cry' | 'neutral';

export interface TrendClassification {
  face: TrendFace;
  reason: string;
}

export interface TrendClassifierConfig {
  lookbackDays?: number;
  confirmDays?: number;
}

const DEFAULT_LOOKBACK_DAYS = 10;
const DEFAULT_CONFIRM_DAYS = 2;

function isTrendClassifierConfig(config: unknown): config is TrendClassifierConfig {
  if (config === undefined) return true;
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  if (c.lookbackDays !== undefined && typeof c.lookbackDays !== 'number') return false;
  if (c.confirmDays !== undefined && typeof c.confirmDays !== 'number') return false;
  return true;
}

/**
 * 判斷目前是「笑臉」（跌深後已離開近期低點、且連續回升，止穩反彈）還是
 * 「哭臉」（持續創近期新低，還沒止跌）。用來當進場建議的安全閥門——
 * 網格策略只看價格是否跌破檔位，不管是不是還在自由落體，這裡補上動能確認。
 * 資料不足時回傳 neutral，reason 會明確標註「資料不足」，不硬猜趨勢。
 */
export function classifyTrend(
  history: PricePoint[],
  config?: TrendClassifierConfig,
): TrendClassification {
  if (!isTrendClassifierConfig(config)) {
    throw new Error('trend-classifier: config 格式不正確，lookbackDays/confirmDays 必須是數字');
  }
  const lookbackDays = config?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const confirmDays = config?.confirmDays ?? DEFAULT_CONFIRM_DAYS;

  if (!Number.isInteger(lookbackDays) || lookbackDays < 1) {
    throw new Error('trend-classifier: lookbackDays 必須是大於等於 1 的整數');
  }
  if (!Number.isInteger(confirmDays) || confirmDays < 1) {
    throw new Error('trend-classifier: confirmDays 必須是大於等於 1 的整數');
  }

  const minRequired = lookbackDays + 1;
  if (history.length < minRequired) {
    return {
      face: 'neutral',
      reason: `資料不足：趨勢判斷需要至少 ${minRequired} 筆收盤價，目前只有 ${history.length} 筆`,
    };
  }

  const closes = history.map((p) => p.close);
  const currentPrice = closes[closes.length - 1];
  const windowBeforeToday = closes.slice(-(lookbackDays + 1), -1);
  const recentLow = Math.min(...windowBeforeToday);

  if (currentPrice <= recentLow) {
    return {
      face: 'cry',
      reason: `目前價格 ${currentPrice} 創近 ${lookbackDays} 個交易日新低（前低 ${recentLow}），趨勢仍持續破底，不建議在此時進場`,
    };
  }

  const confirmWindow = closes.slice(-(confirmDays + 1));
  let isRising = confirmWindow.length === confirmDays + 1;
  for (let i = 1; i < confirmWindow.length; i += 1) {
    if (confirmWindow[i] <= confirmWindow[i - 1]) {
      isRising = false;
      break;
    }
  }

  if (isRising) {
    return {
      face: 'smile',
      reason: `目前價格 ${currentPrice} 已離開近 ${lookbackDays} 個交易日低點（前低 ${recentLow}），且連續 ${confirmDays} 天收高，止穩反彈訊號成立`,
    };
  }

  return {
    face: 'neutral',
    reason: `目前價格 ${currentPrice} 已離開近期低點（前低 ${recentLow}），但尚未連續 ${confirmDays} 天收高，趨勢還不明朗`,
  };
}
