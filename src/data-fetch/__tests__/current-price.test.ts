/* eslint-disable import/first -- jest.mock calls must precede the imports they mock */
jest.mock('../twse-client');
jest.mock('../../db/price-history-repo');

import type { SQLiteDatabase } from 'expo-sqlite';

import { getLatestPriceInfo } from '../../db/price-history-repo';
import { fetchRealtimeQuotes } from '../twse-client';
import { getCurrentPrices, mergeLivePriceIntoHistory } from '../current-price';

const fakeDb = {} as SQLiteDatabase;
const mockFetchRealtimeQuotes = fetchRealtimeQuotes as jest.Mock;
const mockGetLatestPriceInfo = getLatestPriceInfo as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

test('有即時成交價時，以即時報價計算漲跌並標記為 isRealtime', async () => {
  mockFetchRealtimeQuotes.mockResolvedValue([
    {
      code: '2330',
      name: '台積電',
      lastPrice: 2415,
      previousClose: 2410,
      time: '09:24:50',
      date: '2026-07-22',
    },
  ]);

  const result = await getCurrentPrices(fakeDb, ['2330']);

  expect(result['2330']).toEqual({
    price: 2415,
    changeAmount: 5,
    changePercent: expect.closeTo(0.2074, 3),
    isRealtime: true,
    asOf: '09:24:50',
  });
  expect(mockGetLatestPriceInfo).not.toHaveBeenCalled();
});

test('即時報價該檔目前沒有成交價（lastPrice 為 null）時，fallback 用每日收盤價', async () => {
  mockFetchRealtimeQuotes.mockResolvedValue([
    {
      code: '2330',
      name: '台積電',
      lastPrice: null,
      previousClose: 2410,
      time: '09:00:00',
      date: '2026-07-22',
    },
  ]);
  mockGetLatestPriceInfo.mockResolvedValue({
    date: '2026-07-21',
    close: 2410,
    previousClose: 2320,
  });

  const result = await getCurrentPrices(fakeDb, ['2330']);

  expect(result['2330']).toEqual({
    price: 2410,
    changeAmount: 90,
    changePercent: expect.closeTo(3.879, 2),
    isRealtime: false,
    asOf: '2026-07-21',
  });
});

test('即時報價端點整批失敗時，fallback 用每日收盤價', async () => {
  mockFetchRealtimeQuotes.mockRejectedValue(new Error('mis boom'));
  mockGetLatestPriceInfo.mockResolvedValue({
    date: '2026-07-21',
    close: 2410,
    previousClose: 2320,
  });

  const result = await getCurrentPrices(fakeDb, ['2330']);

  expect(result['2330']?.isRealtime).toBe(false);
  expect(result['2330']?.price).toBe(2410);
});

test('DB 也沒有任何資料時回傳 null', async () => {
  mockFetchRealtimeQuotes.mockResolvedValue([]);
  mockGetLatestPriceInfo.mockResolvedValue(null);

  const result = await getCurrentPrices(fakeDb, ['9999']);

  expect(result['9999']).toBeNull();
});

test('只有一筆每日收盤資料、沒有前一筆可比較時，changeAmount/changePercent 為 null', async () => {
  mockFetchRealtimeQuotes.mockResolvedValue([]);
  mockGetLatestPriceInfo.mockResolvedValue({
    date: '2026-07-21',
    close: 2410,
    previousClose: null,
  });

  const result = await getCurrentPrices(fakeDb, ['2330']);

  expect(result['2330']).toEqual({
    price: 2410,
    changeAmount: null,
    changePercent: null,
    isRealtime: false,
    asOf: '2026-07-21',
  });
});

test('空清單直接回傳空物件，不呼叫任何資料源', async () => {
  const result = await getCurrentPrices(fakeDb, []);

  expect(result).toEqual({});
  expect(mockFetchRealtimeQuotes).not.toHaveBeenCalled();
});

describe('mergeLivePriceIntoHistory', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-22T02:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('current 為 null 時原封不動回傳 history', () => {
    const history = [{ date: '2026-07-21', close: 100, high: 101, low: 99, volume: 1000 }];

    expect(mergeLivePriceIntoHistory(history, null)).toBe(history);
  });

  test('current 不是即時報價時，來源跟 history 相同，原封不動回傳', () => {
    const history = [{ date: '2026-07-21', close: 100, high: 101, low: 99, volume: 1000 }];
    const current = {
      price: 100,
      changeAmount: null,
      changePercent: null,
      isRealtime: false,
      asOf: '2026-07-21',
    };

    expect(mergeLivePriceIntoHistory(history, current)).toBe(history);
  });

  test('history 最後一筆已經是今天時，用即時報價更新該筆的 close，並擴展 high/low', () => {
    const history = [
      { date: '2026-07-21', close: 100, high: 101, low: 99, volume: 1000 },
      { date: '2026-07-22', close: 102, high: 103, low: 101, volume: 500 },
    ];
    const current = {
      price: 105,
      changeAmount: 3,
      changePercent: 2.94,
      isRealtime: true,
      asOf: '10:00:00',
    };

    const result = mergeLivePriceIntoHistory(history, current);

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      date: '2026-07-22',
      close: 105,
      high: 105,
      low: 101,
      volume: 500,
    });
  });

  test('history 還沒有今天的資料列時，新增一筆', () => {
    const history = [{ date: '2026-07-21', close: 100, high: 101, low: 99, volume: 1000 }];
    const current = {
      price: 98,
      changeAmount: -2,
      changePercent: -1.98,
      isRealtime: true,
      asOf: '10:00:00',
    };

    const result = mergeLivePriceIntoHistory(history, current);

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ date: '2026-07-22', close: 98, high: 98, low: 98, volume: 0 });
  });

  test('空歷史資料時原封不動回傳，讓策略引擎自行回報資料不足', () => {
    const current = {
      price: 100,
      changeAmount: null,
      changePercent: null,
      isRealtime: true,
      asOf: '10:00:00',
    };

    expect(mergeLivePriceIntoHistory([], current)).toEqual([]);
  });
});
