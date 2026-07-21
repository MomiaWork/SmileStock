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
