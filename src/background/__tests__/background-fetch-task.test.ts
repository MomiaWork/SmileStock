/* eslint-disable import/first -- jest.mock calls must precede the imports they mock */
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));
jest.mock('../../db/schema', () => ({ getDb: jest.fn() }));
jest.mock('../../db/app-meta-repo', () => ({ getMeta: jest.fn(), setMeta: jest.fn() }));
jest.mock('../../db/watchlist-repo', () => ({ getWatchlist: jest.fn() }));
jest.mock('../../data-fetch/price-history-sync', () => ({ syncPriceHistory: jest.fn() }));
jest.mock('../../notifications/run-check', () => ({ checkWatchlistAndNotify: jest.fn() }));

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { setMeta } from '../../db/app-meta-repo';
import { getDb } from '../../db/schema';
import { syncPriceHistory } from '../../data-fetch/price-history-sync';
import { getWatchlist } from '../../db/watchlist-repo';
import { checkWatchlistAndNotify } from '../../notifications/run-check';
import {
  getBackgroundTaskStatusAsync,
  registerBackgroundTaskAsync,
  unregisterBackgroundTaskAsync,
} from '../background-fetch-task';

const fakeDb = {};
const mockDefineTask = TaskManager.defineTask as jest.Mock;
const mockIsTaskRegisteredAsync = TaskManager.isTaskRegisteredAsync as jest.Mock;
const mockRegisterTaskAsync = BackgroundTask.registerTaskAsync as jest.Mock;
const mockUnregisterTaskAsync = BackgroundTask.unregisterTaskAsync as jest.Mock;
const mockGetStatusAsync = BackgroundTask.getStatusAsync as jest.Mock;
const mockGetDb = getDb as jest.Mock;
const mockGetWatchlist = getWatchlist as jest.Mock;
const mockSyncPriceHistory = syncPriceHistory as jest.Mock;
const mockCheckWatchlistAndNotify = checkWatchlistAndNotify as jest.Mock;
const mockSetMeta = setMeta as jest.Mock;

// defineTask 只會在模組載入時呼叫一次，所以在任何 beforeEach 清 mock 之前先把它接住
const taskBody = mockDefineTask.mock.calls[0]?.[1] as (() => Promise<unknown>) | undefined;

beforeEach(() => {
  mockGetDb.mockReset().mockResolvedValue(fakeDb);
  mockGetWatchlist.mockReset();
  mockSyncPriceHistory.mockReset().mockResolvedValue(undefined);
  mockCheckWatchlistAndNotify.mockReset().mockResolvedValue([]);
  mockSetMeta.mockReset();
  mockRegisterTaskAsync.mockReset();
  mockUnregisterTaskAsync.mockReset();
  mockIsTaskRegisteredAsync.mockReset();
  mockGetStatusAsync.mockReset();
});

test('模組載入時就用 TaskManager.defineTask 註冊了任務內容', () => {
  expect(taskBody).toBeInstanceOf(Function);
});

test('任務執行成功時，同步價格、跑策略檢查，並記錄成功結果', async () => {
  mockGetWatchlist.mockResolvedValue([
    { id: 1, stockCode: 'A', stockName: 'A', budget: 1, priceCheckIntervalSec: null },
  ]);

  const result = await taskBody!();

  expect(mockSyncPriceHistory).toHaveBeenCalledWith(fakeDb, ['A']);
  expect(mockCheckWatchlistAndNotify).toHaveBeenCalledWith(fakeDb);
  expect(mockSetMeta).toHaveBeenCalledWith(fakeDb, 'background_last_run_at', expect.any(String));
  expect(mockSetMeta).toHaveBeenCalledWith(fakeDb, 'background_last_result', 'success');
  expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
});

test('watchlist 是空的時候不會呼叫 syncPriceHistory，但仍會跑策略檢查', async () => {
  mockGetWatchlist.mockResolvedValue([]);

  await taskBody!();

  expect(mockSyncPriceHistory).not.toHaveBeenCalled();
  expect(mockCheckWatchlistAndNotify).toHaveBeenCalled();
});

test('過程中丟出例外時，記錄失敗結果並回傳 Failed，不會讓例外往外拋出', async () => {
  mockGetWatchlist.mockRejectedValue(new Error('boom'));

  const result = await taskBody!();

  expect(mockSetMeta).toHaveBeenCalledWith(
    fakeDb,
    'background_last_result',
    expect.stringContaining('boom'),
  );
  expect(result).toBe(BackgroundTask.BackgroundTaskResult.Failed);
});

test('registerBackgroundTaskAsync 帶入 minimumInterval', async () => {
  await registerBackgroundTaskAsync();
  expect(mockRegisterTaskAsync).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ minimumInterval: 15 }),
  );
});

test('unregisterBackgroundTaskAsync 只有在任務已註冊時才會真的取消註冊', async () => {
  mockIsTaskRegisteredAsync.mockResolvedValue(true);
  await unregisterBackgroundTaskAsync();
  expect(mockUnregisterTaskAsync).toHaveBeenCalled();

  mockUnregisterTaskAsync.mockClear();
  mockIsTaskRegisteredAsync.mockResolvedValue(false);
  await unregisterBackgroundTaskAsync();
  expect(mockUnregisterTaskAsync).not.toHaveBeenCalled();
});

test('getBackgroundTaskStatusAsync 轉發 BackgroundTask.getStatusAsync 的結果', async () => {
  mockGetStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Available);
  const status = await getBackgroundTaskStatusAsync();
  expect(status).toBe(BackgroundTask.BackgroundTaskStatus.Available);
});
