/* eslint-disable import/first -- jest.mock calls must precede the imports they mock */
jest.mock('../../db/watchlist-repo');
jest.mock('../../db/price-history-repo');
jest.mock('../../db/pyramid-state-repo');
jest.mock('../../data-fetch/current-price', () => ({
  ...jest.requireActual('../../data-fetch/current-price'),
  getCurrentPrices: jest.fn(),
}));
jest.mock('../local-notification', () => ({
  notifyIfNew: jest.fn(),
  requestNotificationPermission: jest.fn(),
}));

import type { SQLiteDatabase } from 'expo-sqlite';

import { getCurrentPrices } from '../../data-fetch/current-price';
import { getPriceHistory } from '../../db/price-history-repo';
import { getPyramidState, savePyramidState } from '../../db/pyramid-state-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../../db/watchlist-repo';
import { DEFAULT_PYRAMID_PARAMS } from '../../strategy-engine/pyramid-state-machine';
import type { PricePoint } from '../../strategy-engine/types';
import { notifyIfNew } from '../local-notification';
import { checkWatchlistAndNotify, type CheckResultItem } from '../run-check';

/** 測試裡的 mock config 都是 grid/rsi，narrow 掉 pyramid 分支讓 signal/advice 可以直接存取 */
function nonPyramid(
  item: CheckResultItem,
): Extract<CheckResultItem, { strategyType: 'grid' | 'rsi' | 'ma_cross' }> {
  if (item.strategyType === 'pyramid') throw new Error('expected non-pyramid result');
  return item;
}

const fakeDb = {} as SQLiteDatabase;
const mockGetWatchlist = getWatchlist as jest.Mock;
const mockGetEnabledStrategyConfigs = getEnabledStrategyConfigs as jest.Mock;
const mockGetPriceHistory = getPriceHistory as jest.Mock;
const mockGetCurrentPrices = getCurrentPrices as jest.Mock;
const mockNotifyIfNew = notifyIfNew as jest.Mock;
const mockGetPyramidState = getPyramidState as jest.Mock;
const mockSavePyramidState = savePyramidState as jest.Mock;

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
  mockGetCurrentPrices.mockResolvedValue({});
  mockGetPyramidState.mockResolvedValue(null);
});

test('策略觸發但趨勢安全閥尚未確認（wait）也會呼叫 notifyIfNew，signalKey 帶入 action', async () => {
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
  // 只有 1 筆資料，trend-classifier 資料不足回傳 neutral（非笑臉），所以是 wait 不是 enter
  mockGetPriceHistory.mockResolvedValue(history([90]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results).toHaveLength(1);
  expect(nonPyramid(results[0]).signal.triggered).toBe(true);
  expect(nonPyramid(results[0]).signal.tierIndex).toBe(2);
  expect(nonPyramid(results[0]).advice.action).toBe('wait');
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({
      watchlistId: 1,
      strategyConfigId: 10,
      signalKey: 'grid:wait:tier2:2026-07-16',
    }),
  );
});

test('策略觸發且趨勢已確認止穩反彈（enter）時推播文案不同，signalKey 也不同', async () => {
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
  // 前低 86（跌破第 2 檔門檻 90），之後連續兩天收高 87 -> 89，且資料筆數 >= 趨勢判斷預設所需的 11 筆
  mockGetPriceHistory.mockResolvedValue(
    history([120, 118, 116, 114, 112, 110, 105, 100, 95, 90, 86, 87, 89]),
  );

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(nonPyramid(results[0]).advice.action).toBe('enter');
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({
      signalKey: expect.stringContaining('grid:enter:tier2:'),
      title: expect.stringContaining('🟢'),
    }),
  );
});

test('watchlist 開啟進場確認濾網時，趨勢已確認但動能訊號不足會降級為 wait', async () => {
  mockGetWatchlist.mockResolvedValue([
    {
      id: 1,
      stockCode: 'TEST_GRID',
      stockName: '測試',
      budget: 10000,
      priceCheckIntervalSec: null,
      entryConfirmEnabled: true,
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
  // 溫和下跌跌破第 1 檔（95），末端連續收高確認止穩，但 RSI/均線動能濾網（固定參數）不通過
  mockGetPriceHistory.mockResolvedValue(
    history([
      100, 100, 99, 100, 98, 99, 97, 98, 96, 97, 95, 96, 94, 95, 93, 94, 92, 91, 92, 93, 94,
    ]),
  );

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(nonPyramid(results[0]).signal.triggered).toBe(true);
  expect(nonPyramid(results[0]).advice.action).toBe('wait');
  expect(nonPyramid(results[0]).advice.reason).toContain('動能');
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({ signalKey: expect.stringContaining(':wait:') }),
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

  expect(nonPyramid(results[0]).signal.triggered).toBe(false);
  expect(nonPyramid(results[0]).advice.action).toBe('no_signal');
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

test('price_history 最新收盤價還沒跌破門檻，但盤中最新報價已經跌破時，依即時報價觸發', async () => {
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
  // 最新收盤價 100（尚未跌破第 1 檔門檻 95），但盤中最新報價已經跌到 89（跌破第 2 檔門檻 90）
  mockGetPriceHistory.mockResolvedValue(history([100]));
  mockGetCurrentPrices.mockResolvedValue({
    TEST_GRID: {
      price: 89,
      changeAmount: -11,
      changePercent: -11,
      isRealtime: true,
      asOf: '10:00:00',
    },
  });

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(nonPyramid(results[0]).signal.triggered).toBe(true);
  expect(nonPyramid(results[0]).signal.tierIndex).toBe(2);
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({ signalKey: expect.stringContaining(':tier2:') }),
  );
});

test('某一檔股票的 notifyIfNew 失敗時，不會中斷其他股票的檢查', async () => {
  mockGetWatchlist.mockResolvedValue([
    { id: 1, stockCode: 'A', stockName: 'A', budget: 10000, priceCheckIntervalSec: null },
    { id: 2, stockCode: 'B', stockName: 'B', budget: 10000, priceCheckIntervalSec: null },
  ]);
  mockGetEnabledStrategyConfigs.mockImplementation((_db: unknown, watchlistId: number) =>
    Promise.resolve([
      {
        id: watchlistId * 10,
        watchlistId,
        type: 'grid',
        params: { anchorPrice: 100, budget: 10000, spacingPercent: 5, tierCount: 5 },
        enabled: true,
      },
    ]),
  );
  mockGetPriceHistory.mockResolvedValue(history([90]));
  mockNotifyIfNew
    .mockRejectedValueOnce(new Error('scheduleNotificationAsync boom'))
    .mockResolvedValueOnce(true);

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results).toHaveLength(2);
  expect(results[0].notified).toBe(false);
  expect(results[0].notifyError).toContain('boom');
  expect(results[1].notified).toBe(true);
  expect(results[1].notifyError).toBeUndefined();
});

const pyramidTestConfig = {
  ...DEFAULT_PYRAMID_PARAMS,
  entryPrice: 100,
  budget: 45000,
  weights: [1, 1.5, 2],
  maShort: 3,
  maLong: 5,
  consolidationLookback: 5,
  atrPeriod: 3,
  addTriggerPct: 5,
};

test('金字塔加碼觸發加碼（add）時會發通知，且把新狀態存回 pyramid_state', async () => {
  mockGetWatchlist.mockResolvedValue([
    {
      id: 1,
      stockCode: 'TEST_PYRAMID',
      stockName: '測試',
      budget: 45000,
      priceCheckIntervalSec: null,
    },
  ]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([
    { id: 10, watchlistId: 1, type: 'pyramid', params: pyramidTestConfig, enabled: true },
  ]);
  // 均線確認多頭（maShort>maLong 且收盤價站上maShort），現價126遠高於加碼門檻105（entryPrice100 × 1.05）
  mockGetPriceHistory.mockResolvedValue(history([100, 104, 108, 112, 116, 120, 126]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results).toHaveLength(1);
  const [result] = results;
  if (result.strategyType !== 'pyramid') throw new Error('expected pyramid result');
  expect(result.pyramidSignal.action).toBe('add');
  expect(result.pyramidSignal.tierIndex).toBe(1);
  expect(mockSavePyramidState).toHaveBeenCalledWith(
    fakeDb,
    10,
    expect.objectContaining({ currentTier: 1, currentState: 'TRENDING_UP' }),
  );
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({
      signalKey: expect.stringContaining('pyramid:add:tier1:'),
      title: expect.stringContaining('🟢'),
    }),
  );
});

test('金字塔加碼盤整凍結（freeze）不會發通知，但狀態仍會存回去', async () => {
  mockGetWatchlist.mockResolvedValue([
    {
      id: 1,
      stockCode: 'TEST_PYRAMID',
      stockName: '測試',
      budget: 45000,
      priceCheckIntervalSec: null,
    },
  ]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([
    { id: 10, watchlistId: 1, type: 'pyramid', params: pyramidTestConfig, enabled: true },
  ]);
  // 完全走平：均線糾結 + 區間收斂，三取二成立 -> 盤整凍結，不是使用者要採取行動的時刻
  mockGetPriceHistory.mockResolvedValue(history(Array(7).fill(100)));

  const results = await checkWatchlistAndNotify(fakeDb);

  const [result] = results;
  if (result.strategyType !== 'pyramid') throw new Error('expected pyramid result');
  expect(result.pyramidSignal.action).toBe('freeze');
  expect(result.notified).toBe(false);
  expect(mockNotifyIfNew).not.toHaveBeenCalled();
  expect(mockSavePyramidState).toHaveBeenCalledTimes(1);
});
