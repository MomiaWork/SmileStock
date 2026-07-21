/* eslint-disable import/first -- jest.mock calls must precede the imports they mock */
jest.mock('../../db/watchlist-repo');
jest.mock('../../db/price-history-repo');
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Paths: { cache: {} },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn() },
}));
jest.mock('../../db/settings-repo');

import type { SQLiteDatabase } from 'expo-sqlite';

import { getPriceHistory } from '../../db/price-history-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../../db/watchlist-repo';
import type { PricePoint } from '../../strategy-engine/types';
import {
  buildExportSummary,
  buildRunShortcutUrl,
  formatExportJson,
  formatExportText,
  type StockExportSummary,
} from '../shortcuts-export';

const fakeDb = {} as SQLiteDatabase;
const mockGetWatchlist = getWatchlist as jest.Mock;
const mockGetEnabledStrategyConfigs = getEnabledStrategyConfigs as jest.Mock;
const mockGetPriceHistory = getPriceHistory as jest.Mock;

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
});

describe('buildExportSummary', () => {
  test('組出每檔股票的最新價格與各策略的目前狀態', async () => {
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

    const summaries = await buildExportSummary(fakeDb);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].stockCode).toBe('TEST_GRID');
    expect(summaries[0].latestPrice).toBe(90);
    expect(summaries[0].strategies[0].triggered).toBe(true);
  });

  test('沒有價格資料時 latestPrice 是 null，不會噴錯', async () => {
    mockGetWatchlist.mockResolvedValue([
      { id: 1, stockCode: 'A', stockName: 'A', budget: 1000, priceCheckIntervalSec: null },
    ]);
    mockGetEnabledStrategyConfigs.mockResolvedValue([]);
    mockGetPriceHistory.mockResolvedValue([]);

    const summaries = await buildExportSummary(fakeDb);

    expect(summaries[0].latestPrice).toBeNull();
    expect(summaries[0].strategies).toHaveLength(0);
  });
});

describe('formatExportText', () => {
  test('沒有任何股票時輸出明確的空清單訊息', () => {
    const text = formatExportText([], new Date('2026-07-21T00:00:00.000Z'));
    expect(text).toContain('目前沒有監控任何股票');
  });

  test('內容包含股票代號、名稱、價格與每個策略的觸發狀態', () => {
    const summaries: StockExportSummary[] = [
      {
        stockCode: '2330',
        stockName: '台積電',
        latestPrice: 900,
        latestDate: '2026-07-20',
        strategies: [{ type: 'grid', triggered: true, reason: '已跌破第 2 檔' }],
      },
    ];
    const text = formatExportText(summaries, new Date('2026-07-21T00:00:00.000Z'));

    expect(text).toContain('2330');
    expect(text).toContain('台積電');
    expect(text).toContain('900');
    expect(text).toContain('已跌破第 2 檔');
    expect(text).toContain('🔴 觸發');
  });
});

describe('formatExportJson', () => {
  test('輸出的是合法 JSON，且包含股票資料', () => {
    const summaries: StockExportSummary[] = [
      {
        stockCode: '2330',
        stockName: '台積電',
        latestPrice: 900,
        latestDate: '2026-07-20',
        strategies: [],
      },
    ];
    const json = formatExportJson(summaries, new Date('2026-07-21T00:00:00.000Z'));
    const parsed = JSON.parse(json);

    expect(parsed.stocks[0].stockCode).toBe('2330');
    expect(parsed.generatedAt).toBe('2026-07-21T00:00:00.000Z');
  });
});

describe('buildRunShortcutUrl', () => {
  test('捷徑名稱與文字都經過 URL 編碼，中文與換行不會弄壞 URL', () => {
    const url = buildRunShortcutUrl('用Claude分析持股', '第一行\n## 2330 台積電');
    expect(url.startsWith('shortcuts://run-shortcut?name=')).toBe(true);
    expect(url).toContain(`name=${encodeURIComponent('用Claude分析持股')}`);
    expect(url).toContain('input=text');
    expect(url).toContain(`text=${encodeURIComponent('第一行\n## 2330 台積電')}`);
    expect(url).not.toContain('\n');
  });
});

describe('formatClaudePromptText', () => {
  test('內容 = 提示詞（含純文字回覆要求）+ 策略數據', () => {
    const summaries: StockExportSummary[] = [
      {
        stockCode: '2330',
        stockName: '台積電',
        latestPrice: 900,
        latestDate: '2026-07-20',
        strategies: [{ type: 'grid', triggered: false, reason: '未跌破第 1 檔' }],
      },
    ];
    const text = formatClaudePromptText(summaries, new Date('2026-07-21T00:00:00.000Z'));
    expect(text).toContain('台股投資顧問');
    expect(text).toContain('純文字');
    expect(text).toContain('2330');
    expect(text).toContain('未跌破第 1 檔');
    expect(text.indexOf('台股投資顧問')).toBeLessThan(text.indexOf('2330'));
  });
});
