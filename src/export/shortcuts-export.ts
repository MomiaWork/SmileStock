import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Linking } from 'react-native';

import { getCurrentPrices, mergeLivePriceIntoHistory } from '../data-fetch/current-price';
import { getPriceHistory } from '../db/price-history-repo';
import { getPyramidState } from '../db/pyramid-state-repo';
import { getClaudeShortcutName } from '../db/settings-repo';
import { getEnabledStrategyConfigs, getWatchlist } from '../db/watchlist-repo';
import { evaluateStrategy } from '../strategy-engine/engine';
import { evaluatePyramid, type PyramidConfig } from '../strategy-engine/pyramid-state-machine';

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

/**
 * 讀 watchlist -> 對每檔標的的每個啟用策略呼叫 engine.ts，組成匯出用的摘要資料。
 * 併入盤中最新報價後才算策略訊號，避免匯出給 Claude 分析的「最新價格」卡在
 * price_history 最新一筆（可能是前一交易日）的收盤價。
 */
export async function buildExportSummary(db: SQLiteDatabase): Promise<StockExportSummary[]> {
  const watchlist = await getWatchlist(db);
  const currentPrices = await getCurrentPrices(
    db,
    watchlist.map((item) => item.stockCode),
  );
  const summaries: StockExportSummary[] = [];

  for (const item of watchlist) {
    const history = await getPriceHistory(db, item.stockCode);
    const adviceHistory = mergeLivePriceIntoHistory(history, currentPrices[item.stockCode] ?? null);
    const latest = adviceHistory[adviceHistory.length - 1];
    const configs = await getEnabledStrategyConfigs(db, item.id);

    const strategies = await Promise.all(
      configs.map(async (config) => {
        // 金字塔加碼是有狀態策略，不走 evaluateStrategy——用目前已存的狀態唯讀試算一次訊號
        // 給匯出文字用，不會在這裡改寫狀態（改寫由「立即檢查」/背景任務的 run-check.ts 負責）
        if (config.type === 'pyramid') {
          const prevState = await getPyramidState(db, config.id);
          const { signal } = evaluatePyramid(
            adviceHistory,
            config.params as PyramidConfig,
            prevState ?? undefined,
          );
          return { type: config.type, triggered: signal.triggered, reason: signal.reason };
        }
        const signal = evaluateStrategy(adviceHistory, {
          type: config.type,
          params: config.params,
        });
        return { type: config.type, triggered: signal.triggered, reason: signal.reason };
      }),
    );

    summaries.push({
      stockCode: item.stockCode,
      stockName: item.stockName,
      latestPrice: latest?.close ?? null,
      latestDate: latest?.date ?? null,
      strategies,
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
    lines.push('（目前沒有監控任何標的）');
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
 * 給 Claude 的提示詞開頭。由 App 端直接包進匯出文字，捷徑內不需要再組提示詞；
 * 要求純文字回覆，捷徑用「顯示結果」就能直接讀，不需要 Markdown 轉 RTF。
 */
const CLAUDE_PROMPT_HEADER = [
  '你是台股投資顧問。以下是我的持股策略狀態，請針對每檔標的給出「今日建議動作」與理由，最後給整體資產配置提醒。',
  '回覆請用純文字，不要使用任何 Markdown 符號（不要 ** 與 ##），用換行與「•」條列，每檔標的之間空一行，回覆精簡。',
  '',
].join('\n');

/** 提示詞 + 策略數據，給「一鍵執行 Claude 捷徑」用的完整訊息 */
export function formatClaudePromptText(
  summaries: StockExportSummary[],
  generatedAt: Date = new Date(),
): string {
  return `${CLAUDE_PROMPT_HEADER}\n${formatExportText(summaries, generatedAt)}`;
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
  const text = formatClaudePromptText(summaries);
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
