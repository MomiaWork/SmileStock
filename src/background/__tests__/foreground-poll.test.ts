/* eslint-disable import/first -- jest.mock calls must precede the imports they mock */
jest.mock('../../db/schema', () => ({ getDb: jest.fn() }));
jest.mock('../../db/watchlist-repo', () => ({ getWatchlist: jest.fn() }));
jest.mock('../../data-fetch/price-history-sync', () => ({ syncPriceHistory: jest.fn() }));
jest.mock('../../notifications/run-check', () => ({ checkWatchlistAndNotify: jest.fn() }));

import { getDb } from '../../db/schema';
import { syncPriceHistory } from '../../data-fetch/price-history-sync';
import { getWatchlist } from '../../db/watchlist-repo';
import { checkWatchlistAndNotify } from '../../notifications/run-check';
import {
  resetForegroundPollState,
  startForegroundPoll,
  stopForegroundPoll,
} from '../foreground-poll';

const fakeDb = {};
const mockGetDb = getDb as jest.Mock;
const mockGetWatchlist = getWatchlist as jest.Mock;
const mockSyncPriceHistory = syncPriceHistory as jest.Mock;
const mockCheckWatchlistAndNotify = checkWatchlistAndNotify as jest.Mock;

const TICK_MS = 15_000;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetForegroundPollState();
  mockGetDb.mockResolvedValue(fakeDb);
  mockSyncPriceHistory.mockResolvedValue(undefined);
  mockCheckWatchlistAndNotify.mockResolvedValue([]);
});

afterEach(() => {
  stopForegroundPoll();
  jest.useRealTimers();
});

test('第一次 tick 時，所有股票都會被視為到期，觸發同步與檢查', async () => {
  mockGetWatchlist.mockResolvedValue([
    { id: 1, stockCode: 'A', stockName: 'A', budget: 1, priceCheckIntervalSec: 30 },
    { id: 2, stockCode: 'B', stockName: 'B', budget: 1, priceCheckIntervalSec: null },
  ]);

  startForegroundPoll(300);
  await jest.advanceTimersByTimeAsync(TICK_MS);

  expect(mockSyncPriceHistory).toHaveBeenCalledTimes(1);
  expect(mockSyncPriceHistory).toHaveBeenCalledWith(fakeDb, expect.arrayContaining(['A', 'B']));
  expect(mockCheckWatchlistAndNotify).toHaveBeenCalledTimes(1);
});

test('間隔還沒到的股票不會被同步；滿了間隔秒數才會，且不同股票各自獨立判斷', async () => {
  mockGetWatchlist.mockResolvedValue([
    { id: 1, stockCode: 'A', stockName: 'A', budget: 1, priceCheckIntervalSec: 30 },
    { id: 2, stockCode: 'B', stockName: 'B', budget: 1, priceCheckIntervalSec: null },
  ]);

  startForegroundPoll(300); // B 的間隔是 300 秒（預設值）
  await jest.advanceTimersByTimeAsync(TICK_MS); // t=15s，A、B 都因為是第一次檢查而到期
  mockSyncPriceHistory.mockClear();

  await jest.advanceTimersByTimeAsync(TICK_MS); // t=30s，距上次檢查只過 15s，A(30s)/B(300s) 都還沒到
  expect(mockSyncPriceHistory).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(TICK_MS); // t=45s，距上次檢查過了 30s，A 到期了，B 還沒
  expect(mockSyncPriceHistory).toHaveBeenCalledTimes(1);
  expect(mockSyncPriceHistory).toHaveBeenCalledWith(fakeDb, ['A']);
});

test('間隔到了之後，長間隔的股票才會在夠久之後再被同步', async () => {
  mockGetWatchlist.mockResolvedValue([
    { id: 2, stockCode: 'B', stockName: 'B', budget: 1, priceCheckIntervalSec: null },
  ]);

  startForegroundPoll(30); // 全域預設 30 秒
  await jest.advanceTimersByTimeAsync(TICK_MS); // t=15s，第一次視為到期
  mockSyncPriceHistory.mockClear();

  await jest.advanceTimersByTimeAsync(TICK_MS); // t=30s，還沒滿 30 秒（上次是 t=15s）
  expect(mockSyncPriceHistory).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(TICK_MS); // t=45s，滿 30 秒了
  expect(mockSyncPriceHistory).toHaveBeenCalledTimes(1);
  expect(mockSyncPriceHistory).toHaveBeenCalledWith(fakeDb, ['B']);
});

test('stopForegroundPoll 之後，計時器不會再觸發', async () => {
  mockGetWatchlist.mockResolvedValue([
    { id: 1, stockCode: 'A', stockName: 'A', budget: 1, priceCheckIntervalSec: 1 },
  ]);

  startForegroundPoll(300);
  await jest.advanceTimersByTimeAsync(TICK_MS);
  mockSyncPriceHistory.mockClear();

  stopForegroundPoll();
  await jest.advanceTimersByTimeAsync(TICK_MS * 5);

  expect(mockSyncPriceHistory).not.toHaveBeenCalled();
});
