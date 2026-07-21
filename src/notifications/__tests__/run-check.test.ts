/* eslint-disable import/first -- jest.mock calls must precede the imports they mock */
jest.mock('../../db/watchlist-repo');
jest.mock('../../db/price-history-repo');
jest.mock('../local-notification', () => ({
  notifyIfNew: jest.fn(),
  requestNotificationPermission: jest.fn(),
}));

import type { SQLiteDatabase } from 'expo-sqlite';

import { getPriceHistory } from '../../db/price-history-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../../db/watchlist-repo';
import type { PricePoint } from '../../strategy-engine/types';
import { notifyIfNew } from '../local-notification';
import { checkWatchlistAndNotify } from '../run-check';

const fakeDb = {} as SQLiteDatabase;
const mockGetWatchlist = getWatchlist as jest.Mock;
const mockGetEnabledStrategyConfigs = getEnabledStrategyConfigs as jest.Mock;
const mockGetPriceHistory = getPriceHistory as jest.Mock;
const mockNotifyIfNew = notifyIfNew as jest.Mock;

function history(closes: number[]): PricePoint[] {
  return closes.map((close, i) => ({
    date: `2026-07-${String(16 + i).padStart(2, '0')}`,
    close,
    high: close + 1,
    low: close - 1,
    volume: 1000,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifyIfNew.mockResolvedValue(true);
});

test('觸發的策略會呼叫 notifyIfNew，並帶入包含日期的 signalKey', async () => {
  mockGetWatchlist.mockResolvedValue([
    {
      id: 1,
      stockCode: 'TEST_GRID',
      stockName: '測試',
      budget: 10000,
      priceCheckIntervalSec: null,
    },
  ]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([
    {
      id: 10,
      watchlistId: 1,
      type: 'grid',
      params: { anchorPrice: 100, budget: 10000, spacingPercent: 5, tierCount: 5 },
      enabled: true,
    },
  ]);
  mockGetPriceHistory.mockResolvedValue(history([90]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results).toHaveLength(1);
  expect(results[0].signal.triggered).toBe(true);
  expect(results[0].signal.tierIndex).toBe(2);
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({
      watchlistId: 1,
      strategyConfigId: 10,
      signalKey: 'grid:tier2:2026-07-16',
    }),
  );
});

test('未觸發的策略不會呼叫 notifyIfNew', async () => {
  mockGetWatchlist.mockResolvedValue([
    {
      id: 2,
      stockCode: 'TEST_RSI',
      stockName: '測試2',
      budget: 10000,
      priceCheckIntervalSec: null,
    },
  ]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([
    { id: 20, watchlistId: 2, type: 'rsi', params: { period: 4, threshold: 30 }, enabled: true },
  ]);
  mockGetPriceHistory.mockResolvedValue(history([100, 101, 102, 103, 104]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results[0].signal.triggered).toBe(false);
  expect(mockNotifyIfNew).not.toHaveBeenCalled();
});

test('notifyIfNew 回傳 false（已通知過）時，結果會標記 notified=false', async () => {
  mockGetWatchlist.mockResolvedValue([
    {
      id: 1,
      stockCode: 'TEST_GRID',
      stockName: '測試',
      budget: 10000,
      priceCheckIntervalSec: null,
    },
  ]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([
    {
      id: 10,
      watchlistId: 1,
      type: 'grid',
      params: { anchorPrice: 100, budget: 10000, spacingPercent: 5, tierCount: 5 },
      enabled: true,
    },
  ]);
  mockGetPriceHistory.mockResolvedValue(history([90]));
  mockNotifyIfNew.mockResolvedValue(false);

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results[0].notified).toBe(false);
});
