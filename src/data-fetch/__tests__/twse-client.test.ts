import { fetchExtendedHistoricalQuotes, fetchRealtimeQuotes } from '../twse-client';

function mockMisResponse(msgArray: unknown[]): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ msgArray }),
  }) as unknown as typeof fetch;
}

function stockDayRow(date: string, close: string): string[] {
  return [date, '10,000,000', '1,000,000,000', close, close, close, close, '0.00', '5000'];
}

function mockStockDayResponse(stat: string, rows: string[][]): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ stat, data: rows }),
  }) as unknown as typeof fetch;
}

const baseRow = { c: '2330', n: '台積電', y: '2410', d: '20260722', t: '09:24:50' };

afterEach(() => {
  jest.restoreAllMocks();
});

test('z 有成交價時直接採用', async () => {
  mockMisResponse([{ ...baseRow, z: '2415' }]);

  const [quote] = await fetchRealtimeQuotes(['2330']);

  expect(quote.lastPrice).toBe(2415);
});

test('z 為 "-" 時 fallback 用集合競價預估價 pz', async () => {
  mockMisResponse([{ ...baseRow, z: '-', pz: '2412' }]);

  const [quote] = await fetchRealtimeQuotes(['2330']);

  expect(quote.lastPrice).toBe(2412);
});

test('z、pz 都拿不到時 fallback 用試撮合價 oz', async () => {
  mockMisResponse([{ ...baseRow, z: '-', pz: '-', oz: '2408' }]);

  const [quote] = await fetchRealtimeQuotes(['2330']);

  expect(quote.lastPrice).toBe(2408);
});

test('z、pz、oz 都拿不到時 fallback 用五檔買賣中價', async () => {
  mockMisResponse([
    { ...baseRow, z: '-', pz: '-', oz: '-', b: '2400_2399_2398_2397_2396', a: '2404_2405_2406_2407_2408' },
  ]);

  const [quote] = await fetchRealtimeQuotes(['2330']);

  expect(quote.lastPrice).toBe(2402);
});

test('連買賣中價都缺（只有單邊掛單）時 fallback 用昨收 y，這是低流動性標的原本會卡在呼叫端每日收盤價的情境', async () => {
  mockMisResponse([{ ...baseRow, z: '-', pz: '-', oz: '-', b: '-', a: '2404_2405' }]);

  const [quote] = await fetchRealtimeQuotes(['2330']);

  expect(quote.lastPrice).toBe(2410);
});

test('昨收 y 本身格式不正確（不只是缺席）時，整筆略過而非硬湊出價格', async () => {
  mockMisResponse([{ ...baseRow, z: '-', y: '-' }]);

  const quotes = await fetchRealtimeQuotes(['2330']);

  expect(quotes).toHaveLength(0);
});

describe('fetchExtendedHistoricalQuotes', () => {
  test('依 months 逐月抓取，每月一次 fetch，結果依日期排序', async () => {
    mockStockDayResponse('OK', [stockDayRow('115/07/01', '100'), stockDayRow('115/07/02', '101')]);

    const quotes = await fetchExtendedHistoricalQuotes('2330', 3);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(quotes).toHaveLength(6);
    const dates = quotes.map((q) => q.date);
    expect(dates).toEqual([...dates].sort());
  });

  test('當天完全沒有成交（開高低收為 "--"）時跳過該列，不整批噴錯中斷', async () => {
    const noTradeRow = [
      '115/07/03',
      '0',
      '0',
      '--',
      '--',
      '--',
      '--',
      ' 0.00',
      '0',
    ];
    mockStockDayResponse('OK', [
      stockDayRow('115/07/01', '100'),
      noTradeRow,
      stockDayRow('115/07/02', '101'),
    ]);

    const quotes = await fetchExtendedHistoricalQuotes('2330', 1);

    expect(quotes).toHaveLength(2);
    expect(quotes.map((q) => q.date)).toEqual(['2026-07-01', '2026-07-02']);
  });

  test('回溯到掛牌前的月份（stat 非 OK）回傳空陣列，不中斷其餘月份的抓取', async () => {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      call += 1;
      // 最近 2 個月有資料，更早的月份（掛牌前）stat 非 OK
      const isRecent = call <= 2;
      return Promise.resolve({
        ok: true,
        json: async () => (isRecent ? { stat: 'OK', data: [stockDayRow('115/07/01', '100')] } : { stat: '' }),
      });
    }) as unknown as typeof fetch;

    const quotes = await fetchExtendedHistoricalQuotes('2330', 4);

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(quotes).toHaveLength(2);
  });
});
