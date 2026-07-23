import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertPriceHistory } from '../db/price-history-repo';
import { fetchDailyQuotes, fetchHistoricalDailyQuotes, type TwseDailyQuote } from './twse-client';

/**
 * 抓取指定標的代號的最新收盤價並寫入 price_history（同一天重複執行為 upsert）。
 */
export async function syncPriceHistory(
  db: SQLiteDatabase,
  stockCodes: string[],
): Promise<TwseDailyQuote[]> {
  const quotes = await fetchDailyQuotes(stockCodes);

  await upsertPriceHistory(
    db,
    quotes.map((quote) => ({
      stockCode: quote.code,
      date: quote.date,
      close: quote.closingPrice,
      high: quote.highestPrice,
      low: quote.lowestPrice,
      volume: quote.tradeVolume,
    })),
  );

  return quotes;
}

const DEFAULT_BACKFILL_TRADING_DAYS = 21;

/**
 * 新增標的時一次回補歷史收盤價（預設抓到至少 21 筆，涵蓋 RSI(14)/MA(20) 預設參數所需天數），
 * 不用等每日同步逐筆累積好幾週。
 */
export async function backfillPriceHistory(
  db: SQLiteDatabase,
  stockCode: string,
  minTradingDays: number = DEFAULT_BACKFILL_TRADING_DAYS,
): Promise<TwseDailyQuote[]> {
  const quotes = await fetchHistoricalDailyQuotes(stockCode, minTradingDays);

  await upsertPriceHistory(
    db,
    quotes.map((quote) => ({
      stockCode,
      date: quote.date,
      close: quote.closingPrice,
      high: quote.highestPrice,
      low: quote.lowestPrice,
      volume: quote.tradeVolume,
    })),
  );

  return quotes;
}
