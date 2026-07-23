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
import { checkWatchlistAndNotify } from '../run-check';

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

const watchItem = {
  id: 1,
  stockCode: 'TEST',
  stockName: '測試',
  budget: 10000,
  priceCheckIntervalSec: null,
  entryConfirmEnabled: false,
};

const gridConfigRow = {
  id: 10,
  watchlistId: 1,
  type: 'grid',
  params: { anchorPrice: 100, budget: 10000, spacingPercent: 5, tierCount: 5 },
  enabled: true,
};

const pyramidTestParams = {
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

const pyramidConfigRow = {
  id: 20,
  watchlistId: 1,
  type: 'pyramid',
  params: pyramidTestParams,
  enabled: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifyIfNew.mockResolvedValue(true);
  mockGetCurrentPrices.mockResolvedValue({});
  mockGetPyramidState.mockResolvedValue(null);
});

test('只開網格：檔位觸發但趨勢安全閥尚未確認（wait）也會通知，signalKey 帶入 action 與檔位', async () => {
  mockGetWatchlist.mockResolvedValue([watchItem]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([gridConfigRow]);
  // 只有 1 筆資料，trend-classifier 資料不足回傳 neutral（非笑臉），所以是 wait 不是 enter
  mockGetPriceHistory.mockResolvedValue(history([90]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results).toHaveLength(1);
  expect(results[0].recommendation?.source).toBe('grid');
  expect(results[0].recommendation?.action).toBe('wait');
  expect(results[0].recommendation?.tierIndex).toBe(2);
  expect(results[0].strategyConfigId).toBe(10);
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({
      watchlistId: 1,
      strategyConfigId: 10,
      signalKey: 'grid:wait:tier2:2026-07-16',
    }),
  );
});

test('只開網格：觸發且趨勢已確認止穩反彈（enter）時通知文案不同，signalKey 也不同', async () => {
  mockGetWatchlist.mockResolvedValue([watchItem]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([gridConfigRow]);
  // 前低 86（跌破第 2 檔門檻 90），之後連續兩天收高 87 -> 89，且資料筆數 >= 趨勢判斷預設所需的 11 筆
  mockGetPriceHistory.mockResolvedValue(
    history([120, 118, 116, 114, 112, 110, 105, 100, 95, 90, 86, 87, 89]),
  );

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results[0].recommendation?.action).toBe('enter');
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({
      signalKey: expect.stringContaining('grid:enter:tier2:'),
      title: expect.stringContaining('🟢'),
    }),
  );
});

test('watchlist 開啟進場確認濾網時，趨勢已確認但動能訊號不足會降級為 wait', async () => {
  mockGetWatchlist.mockResolvedValue([{ ...watchItem, entryConfirmEnabled: true }]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([gridConfigRow]);
  // 溫和下跌跌破第 1 檔（95），末端連續收高確認止穩，但 RSI/均線動能濾網（固定參數）不通過
  mockGetPriceHistory.mockResolvedValue(
    history([
      100, 100, 99, 100, 98, 99, 97, 98, 96, 97, 95, 96, 94, 95, 93, 94, 92, 91, 92, 93, 94,
    ]),
  );

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results[0].recommendation?.action).toBe('wait');
  expect(results[0].recommendation?.reason).toContain('動能');
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({ signalKey: expect.stringContaining(':wait:') }),
  );
});

test('網格未觸發（no_signal）不會呼叫 notifyIfNew', async () => {
  mockGetWatchlist.mockResolvedValue([watchItem]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([gridConfigRow]);
  mockGetPriceHistory.mockResolvedValue(history([100, 101, 102, 103, 104]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results[0].recommendation?.action).toBe('no_signal');
  expect(results[0].notified).toBe(false);
  expect(mockNotifyIfNew).not.toHaveBeenCalled();
});

test('沒有啟用任何策略（含只剩舊版 rsi/ma_cross 設定列）時不評估也不通知', async () => {
  mockGetWatchlist.mockResolvedValue([watchItem]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([
    { id: 30, watchlistId: 1, type: 'rsi', params: { period: 14, threshold: 30 }, enabled: true },
  ]);
  mockGetPriceHistory.mockResolvedValue(history([90]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results).toHaveLength(1);
  expect(results[0].recommendation).toBeNull();
  expect(results[0].strategyConfigId).toBeNull();
  expect(mockNotifyIfNew).not.toHaveBeenCalled();
});

test('notifyIfNew 回傳 false（已通知過）時，結果會標記 notified=false', async () => {
  mockGetWatchlist.mockResolvedValue([watchItem]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([gridConfigRow]);
  mockGetPriceHistory.mockResolvedValue(history([90]));
  mockNotifyIfNew.mockResolvedValue(false);

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results[0].notified).toBe(false);
});

test('price_history 最新收盤價還沒跌破門檻，但盤中最新報價已經跌破時，依即時報價觸發', async () => {
  mockGetWatchlist.mockResolvedValue([watchItem]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([gridConfigRow]);
  // 最新收盤價 100（尚未跌破第 1 檔門檻 95），但盤中最新報價已經跌到 89（跌破第 2 檔門檻 90）
  mockGetPriceHistory.mockResolvedValue(history([100]));
  mockGetCurrentPrices.mockResolvedValue({
    TEST: {
      price: 89,
      changeAmount: -11,
      changePercent: -11,
      isRealtime: true,
      asOf: '10:00:00',
    },
  });

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results[0].recommendation?.tierIndex).toBe(2);
  expect(mockNotifyIfNew).toHaveBeenCalledWith(
    fakeDb,
    expect.objectContaining({ signalKey: expect.stringContaining(':tier2:') }),
  );
});

test('某一檔標的的 notifyIfNew 失敗時，不會中斷其他標的的檢查', async () => {
  mockGetWatchlist.mockResolvedValue([
    { ...watchItem, id: 1, stockCode: 'A', stockName: 'A' },
    { ...watchItem, id: 2, stockCode: 'B', stockName: 'B' },
  ]);
  mockGetEnabledStrategyConfigs.mockImplementation((_db: unknown, watchlistId: number) =>
    Promise.resolve([{ ...gridConfigRow, id: watchlistId * 10, watchlistId }]),
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

test('只開金字塔：觸發加碼（add）時會發通知，且把新狀態存回 pyramid_state', async () => {
  mockGetWatchlist.mockResolvedValue([{ ...watchItem, budget: 45000 }]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([pyramidConfigRow]);
  // 均線確認多頭（maShort>maLong 且收盤價站上maShort），現價126遠高於加碼門檻105（entryPrice100 × 1.05）
  mockGetPriceHistory.mockResolvedValue(history([100, 104, 108, 112, 116, 120, 126]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results).toHaveLength(1);
  expect(results[0].recommendation?.source).toBe('pyramid');
  expect(results[0].recommendation?.action).toBe('add');
  expect(results[0].recommendation?.tierIndex).toBe(1);
  expect(results[0].strategyConfigId).toBe(20);
  expect(mockSavePyramidState).toHaveBeenCalledWith(
    fakeDb,
    20,
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

test('只開金字塔：盤整凍結（freeze）不會發通知，但狀態仍會存回去', async () => {
  mockGetWatchlist.mockResolvedValue([{ ...watchItem, budget: 45000 }]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([pyramidConfigRow]);
  // 完全走平：均線糾結 + 區間收斂，三取二成立 -> 盤整凍結，不是使用者要採取行動的時刻
  mockGetPriceHistory.mockResolvedValue(history(Array(7).fill(100)));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results[0].recommendation?.action).toBe('freeze');
  expect(results[0].notified).toBe(false);
  expect(mockNotifyIfNew).not.toHaveBeenCalled();
  expect(mockSavePyramidState).toHaveBeenCalledTimes(1);
});

test('雙策略同開：同一檔標的只產生一筆結果、最多一則通知，並依市場狀態路由', async () => {
  mockGetWatchlist.mockResolvedValue([{ ...watchItem, budget: 45000 }]);
  mockGetEnabledStrategyConfigs.mockResolvedValue([gridConfigRow, pyramidConfigRow]);
  // 上升趨勢：路由應選金字塔（加碼），而不是讓網格與金字塔各自評估、各發各的通知
  mockGetPriceHistory.mockResolvedValue(history([100, 104, 108, 112, 116, 120, 126]));

  const results = await checkWatchlistAndNotify(fakeDb);

  expect(results).toHaveLength(1);
  expect(results[0].recommendation?.source).toBe('pyramid');
  expect(results[0].recommendation?.action).toBe('add');
  expect(results[0].recommendation?.regime).toBe('TRENDING_UP');
  expect(mockNotifyIfNew).toHaveBeenCalledTimes(1);
  expect(mockSavePyramidState).toHaveBeenCalledWith(fakeDb, 20, expect.any(Object));
});
