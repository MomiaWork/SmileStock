import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertPriceHistory } from '../db/price-history-repo';
import { fetchDailyQuotes, type TwseDailyQuote } from './twse-client';

/**
 * 抓取指定股票代號的最新收盤價並寫入 price_history（同一天重複執行為 upsert）。
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
