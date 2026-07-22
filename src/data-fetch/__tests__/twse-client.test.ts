import { fetchRealtimeQuotes } from '../twse-client';

function mockMisResponse(msgArray: unknown[]): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ msgArray }),
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
