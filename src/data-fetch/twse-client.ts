export interface TwseDailyQuote {
  code: string;
  name: string;
  date: string;
  openingPrice: number;
  highestPrice: number;
  lowestPrice: number;
  closingPrice: number;
  tradeVolume: number;
}

const STOCK_DAY_ALL_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

interface RawTwseRecord {
  Date: string;
  Code: string;
  Name: string;
  TradeVolume: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
}

const REQUIRED_STRING_FIELDS: (keyof RawTwseRecord)[] = [
  'Date',
  'Code',
  'Name',
  'TradeVolume',
  'OpeningPrice',
  'HighestPrice',
  'LowestPrice',
  'ClosingPrice',
];

function isRawTwseRecord(value: unknown): value is RawTwseRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return REQUIRED_STRING_FIELDS.every((field) => typeof r[field] === 'string');
}

/** TWSE 日期為民國年，例如 "1150720" -> 2026-07-20 */
function parseRocDate(rocDate: string): string {
  if (!/^\d{6,7}$/.test(rocDate)) {
    throw new Error(`twse-client: 無法解析日期格式 "${rocDate}"`);
  }
  const month = rocDate.slice(-4, -2);
  const day = rocDate.slice(-2);
  const rocYear = Number(rocDate.slice(0, rocDate.length - 4));
  const year = rocYear + 1911;
  return `${year}-${month}-${day}`;
}

function parseNumberField(value: string, fieldName: string, code: string): number {
  const cleaned = value.replace(/,/g, '');
  const n = Number(cleaned);
  if (Number.isNaN(n)) {
    throw new Error(`twse-client: 股票 ${code} 的欄位 ${fieldName} 格式不正確："${value}"`);
  }
  return n;
}

function toQuote(record: RawTwseRecord): TwseDailyQuote {
  return {
    code: record.Code,
    name: record.Name,
    date: parseRocDate(record.Date),
    openingPrice: parseNumberField(record.OpeningPrice, 'OpeningPrice', record.Code),
    highestPrice: parseNumberField(record.HighestPrice, 'HighestPrice', record.Code),
    lowestPrice: parseNumberField(record.LowestPrice, 'LowestPrice', record.Code),
    closingPrice: parseNumberField(record.ClosingPrice, 'ClosingPrice', record.Code),
    tradeVolume: parseNumberField(record.TradeVolume, 'TradeVolume', record.Code),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw new Error(
    `twse-client: 呼叫 TWSE API 重試 ${MAX_ATTEMPTS} 次後仍失敗：${String(lastError)}`,
  );
}

const STOCK_DAY_URL = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';

interface RawStockDayResponse {
  stat: string;
  fields?: unknown;
  data?: unknown;
}

const STOCK_DAY_FIELD_COUNT = 9;
// data 每列欄位順序：日期,成交股數,成交金額,開盤價,最高價,最低價,收盤價,漲跌價差,成交筆數
const STOCK_DAY_INDEX = {
  date: 0,
  volume: 1,
  open: 3,
  high: 4,
  low: 5,
  close: 6,
} as const;

function isRawStockDayResponse(value: unknown): value is RawStockDayResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { stat?: unknown }).stat === 'string'
  );
}

/** STOCK_DAY 回傳的日期為「113/07/01」這種民國年斜線格式，跟 STOCK_DAY_ALL 的格式不同 */
function parseSlashRocDate(rocDate: string): string {
  const match = /^(\d{2,3})\/(\d{2})\/(\d{2})$/.exec(rocDate);
  if (!match) {
    throw new Error(`twse-client: 無法解析日期格式 "${rocDate}"`);
  }
  const [, rocYear, month, day] = match;
  const year = Number(rocYear) + 1911;
  return `${year}-${month}-${day}`;
}

function toYyyymm01(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}01`;
}

/**
 * 抓取單一股票、單一月份的每日收盤資料（TWSE 個股日成交資訊，非 openapi.twse.com.tw 的 v1 端點，
 * 但同樣是 TWSE 官方網域、免費、無需 API key）。
 * 該月尚無資料（例如股票掛牌前、或月份還沒有任何交易日）時回傳空陣列，不視為錯誤；
 * 回應格式本身不正確（缺欄位/型別錯誤）才丟明確錯誤。
 */
async function fetchMonthlyQuotes(code: string, yyyymm01: string): Promise<TwseDailyQuote[]> {
  const url = `${STOCK_DAY_URL}?response=json&date=${yyyymm01}&stockNo=${encodeURIComponent(code)}`;
  const raw = await fetchWithRetry(url);
  if (!isRawStockDayResponse(raw)) {
    throw new Error(`twse-client: 股票 ${code} 的月資料回傳格式不正確`);
  }
  if (raw.stat !== 'OK') {
    return [];
  }
  if (!Array.isArray(raw.data)) {
    throw new Error(`twse-client: 股票 ${code} 的月資料缺少 data 陣列`);
  }

  return raw.data.map((row): TwseDailyQuote => {
    if (
      !Array.isArray(row) ||
      row.length < STOCK_DAY_FIELD_COUNT ||
      !row.every((v) => typeof v === 'string')
    ) {
      throw new Error(`twse-client: 股票 ${code} 的月資料列格式不正確：${JSON.stringify(row)}`);
    }
    return {
      code,
      name: code,
      date: parseSlashRocDate(row[STOCK_DAY_INDEX.date]),
      openingPrice: parseNumberField(row[STOCK_DAY_INDEX.open], 'OpeningPrice', code),
      highestPrice: parseNumberField(row[STOCK_DAY_INDEX.high], 'HighestPrice', code),
      lowestPrice: parseNumberField(row[STOCK_DAY_INDEX.low], 'LowestPrice', code),
      closingPrice: parseNumberField(row[STOCK_DAY_INDEX.close], 'ClosingPrice', code),
      tradeVolume: parseNumberField(row[STOCK_DAY_INDEX.volume], 'TradeVolume', code),
    };
  });
}

const BACKFILL_MAX_MONTHS_BACK = 6;

/**
 * 回補單一股票至少 minTradingDays 筆歷史收盤資料（由當月往前逐月抓取，最多回溯
 * BACKFILL_MAX_MONTHS_BACK 個月）。用於新增股票時讓 RSI/均線策略不用乾等資料逐日累積。
 * 若回溯到底仍不足 minTradingDays 筆（例如剛掛牌不久的股票），就回傳目前抓得到的全部，
 * 交給 strategy-engine 自行回報「資料不足」，這裡不補算不假設。
 */
export async function fetchHistoricalDailyQuotes(
  code: string,
  minTradingDays: number,
): Promise<TwseDailyQuote[]> {
  const collected: TwseDailyQuote[] = [];
  const cursor = new Date();

  for (let monthsBack = 0; monthsBack < BACKFILL_MAX_MONTHS_BACK; monthsBack += 1) {
    const monthQuotes = await fetchMonthlyQuotes(code, toYyyymm01(cursor));
    collected.unshift(...monthQuotes);
    if (collected.length >= minTradingDays) break;
    cursor.setMonth(cursor.getMonth() - 1);
  }

  collected.sort((a, b) => a.date.localeCompare(b.date));
  return collected;
}

/**
 * 抓取指定股票代號的最新日收盤資料。
 * TWSE OpenAPI 一次回傳所有上市證券，這裡在本機端過濾出關注的代號。
 * 找不到的代號、或資料欄位缺失/格式錯誤，一律丟明確錯誤，不靜默略過。
 */
export async function fetchDailyQuotes(codes: string[]): Promise<TwseDailyQuote[]> {
  const raw = await fetchWithRetry(STOCK_DAY_ALL_URL);
  if (!Array.isArray(raw)) {
    throw new Error('twse-client: TWSE API 回傳格式不正確，預期是陣列');
  }

  const codeSet = new Set(codes);
  const foundCodes = new Set<string>();
  const quotes: TwseDailyQuote[] = [];

  for (const record of raw) {
    if (typeof record !== 'object' || record === null) continue;
    const code = (record as Record<string, unknown>).Code;
    if (typeof code !== 'string' || !codeSet.has(code)) continue;

    if (!isRawTwseRecord(record)) {
      throw new Error(`twse-client: 股票 ${code} 的資料缺少必要欄位：${JSON.stringify(record)}`);
    }
    foundCodes.add(code);
    quotes.push(toQuote(record));
  }

  const missing = codes.filter((code) => !foundCodes.has(code));
  if (missing.length > 0) {
    throw new Error(`twse-client: TWSE API 回傳資料中找不到股票代號：${missing.join(', ')}`);
  }

  return quotes;
}
