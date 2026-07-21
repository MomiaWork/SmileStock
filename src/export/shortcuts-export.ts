import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Linking } from 'react-native';

import { getPriceHistory } from '../db/price-history-repo';
import { getClaudeShortcutName } from '../db/settings-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../db/watchlist-repo';
import { evaluateStrategy } from '../strategy-engine/engine';

export interface StockExportSummary {
  stockCode: string;
  stockName: string;
  latestPrice: number | null;
  latestDate: string | null;
  strategies: {
    type: string;
    triggered: boolean;
    reason: string;
  }[];
}

/** 讀 watchlist -> 對每檔股票的每個啟用策略呼叫 engine.ts，組成匯出用的摘要資料 */
export async function buildExportSummary(db: SQLiteDatabase): Promise<StockExportSummary[]> {
  const watchlist = await getWatchlist(db);
  const summaries: StockExportSummary[] = [];

  for (const item of watchlist) {
    const history = await getPriceHistory(db, item.stockCode);
    const latest = history[history.length - 1];
    const configs = await getEnabledStrategyConfigs(db, item.id);

    summaries.push({
      stockCode: item.stockCode,
      stockName: item.stockName,
      latestPrice: latest?.close ?? null,
      latestDate: latest?.date ?? null,
      strategies: configs.map((config) => {
        const signal = evaluateStrategy(history, { type: config.type, params: config.params });
        return { type: config.type, triggered: signal.triggered, reason: signal.reason };
      }),
    });
  }

  return summaries;
}

export function formatExportText(
  summaries: StockExportSummary[],
  generatedAt: Date = new Date(),
): string {
  const lines: string[] = [];
  lines.push(`台股盯盤策略比較 - ${generatedAt.toISOString()}`);
  lines.push('');

  if (summaries.length === 0) {
    lines.push('（目前沒有監控任何股票）');
    return lines.join('\n');
  }

  for (const s of summaries) {
    lines.push(`## ${s.stockCode} ${s.stockName}`);
    lines.push(
      `最新價格：${s.latestPrice ?? '無資料'}${s.latestDate ? `（${s.latestDate}）` : ''}`,
    );
    if (s.strategies.length === 0) {
      lines.push('（沒有啟用任何策略）');
    } else {
      for (const strat of s.strategies) {
        lines.push(
          `- [${strat.type}] ${strat.triggered ? '🔴 觸發' : '⚪️ 未觸發'}：${strat.reason}`,
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function formatExportJson(
  summaries: StockExportSummary[],
  generatedAt: Date = new Date(),
): string {
  return JSON.stringify({ generatedAt: generatedAt.toISOString(), stocks: summaries }, null, 2);
}

const EXPORT_FILE_NAME = 'smilestock-export.txt';

/**
 * 產生文字版策略比較摘要並開啟系統分享面板（Share Sheet）。
 * 使用者可在分享面板選擇「捷徑」把文字轉交給其他 App 做後續處理，
 * 這裡只負責把資料匯出成好讀的文字，不做任何深度整合。
 */
export async function shareStrategyExport(db: SQLiteDatabase): Promise<void> {
  const summaries = await buildExportSummary(db);
  const text = formatExportText(summaries);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('shortcuts-export: 這個裝置/平台不支援系統分享面板');
  }

  const file = new File(Paths.cache, EXPORT_FILE_NAME);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(text);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/plain',
    dialogTitle: '分享策略比較結果',
  });
}

/**
 * 組出 iOS 捷徑 App 的 run-shortcut URL：直接執行指定名稱的捷徑，
 * 匯出文字經 URL 編碼後以 text 參數帶入，捷徑內用「捷徑輸入」即可取得。
 */
export function buildRunShortcutUrl(shortcutName: string, text: string): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(text)}`;
}

/**
 * 一鍵執行使用者指定的 iOS 捷徑（不經分享面板）。
 * 捷徑名稱存在設定裡，必須與捷徑 App 內的名稱完全一致，否則捷徑 App 會報找不到。
 * 僅 iOS 有捷徑 App；其他平台 openURL 會失敗並丟出錯誤，由呼叫端顯示。
 */
export async function runClaudeShortcut(db: SQLiteDatabase): Promise<void> {
  const summaries = await buildExportSummary(db);
  const text = formatExportText(summaries);
  const shortcutName = await getClaudeShortcutName(db);
  const url = buildRunShortcutUrl(shortcutName, text);
  try {
    await Linking.openURL(url);
  } catch {
    throw new Error(
      `shortcuts-export: 無法開啟捷徑「${shortcutName}」，請確認裝置已安裝捷徑 App，且設定頁的捷徑名稱與捷徑 App 內的名稱完全一致`,
    );
  }
}
