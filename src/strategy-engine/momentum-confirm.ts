import { maCrossStrategy } from './ma-cross-strategy';
import { rsiStrategy } from './rsi-strategy';
import type { PricePoint } from './types';

export interface MomentumConfirmResult {
  confirmed: boolean;
  reason: string;
}

const RSI_PARAMS = { period: 14, threshold: 30 };
const MA_CROSS_PARAMS = { shortPeriod: 5, longPeriod: 20 };

/**
 * 動能確認濾網：`entry-advisor.ts` 的笑臉/哭臉安全閥確認趨勢止穩後，
 * 額外用固定參數的 RSI／均線交叉再確認一次近期動能是否轉強，兩者取一觸發即通過。
 * 使用者不會看到 RSI/均線交叉這兩個詞或需要設定任何參數——這是專門給這個濾網用的
 * 固定內部參數，不是使用者可調整的策略設定。
 */
export function checkMomentumConfirm(history: PricePoint[]): MomentumConfirmResult {
  const rsiSignal = rsiStrategy.evaluate(history, RSI_PARAMS);
  const maSignal = maCrossStrategy.evaluate(history, MA_CROSS_PARAMS);

  if (rsiSignal.triggered || maSignal.triggered) {
    return { confirmed: true, reason: '近期動能訊號已轉強' };
  }
  return { confirmed: false, reason: '近期動能訊號尚未轉強' };
}
