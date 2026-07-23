import type { SQLiteDatabase } from 'expo-sqlite';

import { getLatestPriceInfo } from '../db/price-history-repo';
import type { PricePoint } from '../strategy-engine/types';
import { fetchRealtimeQuotes } from './twse-client';

export interface CurrentPriceInfo {
  price: number;
  changeAmount: number | null;
  changePercent: number | null;
  /** true：來自盤中即時報價；false：fallback 用 price_history 裡最新的每日收盤價 */
  isRealtime: boolean;
  /** isRealtime 為 true 時是 "HH:MM:SS"，否則是收盤日期 "YYYY-MM-DD" */
  asOf: string;
}

function computeChange(
  price: number,
  previousClose: number | null,
): Pick<CurrentPriceInfo, 'changeAmount' | 'changePercent'> {
  if (previousClose === null) {
    return { changeAmount: null, changePercent: null };
  }
  const changeAmount = price - previousClose;
  return { changeAmount, changePercent: (changeAmount / previousClose) * 100 };
}

/**
 * 取得多檔標的的「目前價格」顯示資料：優先用 fetchRealtimeQuotes 的盤中最新成交價，
 * 該端點失敗或某檔暫時沒有成交價時，fallback 用 price_history 裡最新一筆每日收盤價
 * （策略引擎在用的資料源，一定存在只是可能是前一交易日的）。純供畫面顯示，不寫入 DB。
 */
export async function getCurrentPrices(
  db: SQLiteDatabase,
  stockCodes: string[],
): Promise<Record<string, CurrentPriceInfo | null>> {
  const result: Record<string, CurrentPriceInfo | null> = {};
  if (stockCodes.length === 0) return result;

  const realtimeByCode = new Map<
    string,
    { lastPrice: number | null; previousClose: number; time: string }
  >();
  try {
    const quotes = await fetchRealtimeQuotes(stockCodes);
    for (const quote of quotes) {
      realtimeByCode.set(quote.code, quote);
    }
  } catch {
    // 即時報價端點失敗（非官方文件化，穩定性沒保證）時整批 fallback 用每日收盤，不擋畫面
  }

  for (const code of stockCodes) {
    const realtime = realtimeByCode.get(code);
    if (realtime && realtime.lastPrice !== null) {
      result[code] = {
        price: realtime.lastPrice,
        ...computeChange(realtime.lastPrice, realtime.previousClose),
        isRealtime: true,
        asOf: realtime.time,
      };
      continue;
    }

    const daily = await getLatestPriceInfo(db, code);
    result[code] = daily
      ? {
          price: daily.close,
          ...computeChange(daily.close, daily.previousClose),
          isRealtime: false,
          asOf: daily.date,
        }
      : null;
  }

  return result;
}

/**
 * 把「目前價格」併入策略引擎要用的歷史資料，讓進場/出場建議依盤中最新報價判斷，
 * 不會卡在 price_history 裡最新一筆（可能是前一交易日、甚至今天背景同步還沒跑過）的收盤價。
 * current 不是即時報價（isRealtime 為 false）時，代表它的來源本來就跟 history 最後一筆相同，
 * 沒有新資訊可合併，直接回傳原本的 history。
 *
 * history 最後一筆若已經是今天，直接把它的 close 更新成最新報價（high/low 一併擴展涵蓋這個價位）；
 * 若還沒有今天的資料列，就新增一筆——high/low/volume 這幾個欄位目前的策略（網格、趨勢判斷）
 * 都只讀 close，所以用 close 帶入純粹是滿足型別，不影響任何判斷邏輯。
 */
export function mergeLivePriceIntoHistory(
  history: PricePoint[],
  current: CurrentPriceInfo | null,
): PricePoint[] {
  if (!current || !current.isRealtime || history.length === 0) return history;

  const todayDate = new Date().toISOString().slice(0, 10);
  const lastPoint = history[history.length - 1];

  if (lastPoint.date === todayDate) {
    return [
      ...history.slice(0, -1),
      {
        ...lastPoint,
        close: current.price,
        high: Math.max(lastPoint.high, current.price),
        low: Math.min(lastPoint.low, current.price),
      },
    ];
  }

  return [
    ...history,
    { date: todayDate, close: current.price, high: current.price, low: current.price, volume: 0 },
  ];
}
