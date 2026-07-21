import { getDb } from '../db/schema';
import { getWatchlist } from '../db/watchlist-repo';
import { syncPriceHistory } from '../data-fetch/price-history-sync';
import { checkWatchlistAndNotify } from '../notifications/run-check';

const TICK_INTERVAL_MS = 15_000;
export const DEFAULT_CHECK_INTERVAL_SEC = 300;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
const lastCheckedAtByCode = new Map<string, number>();

async function tick(defaultIntervalSec: number): Promise<void> {
  const db = await getDb();
  const watchlist = await getWatchlist(db);
  const now = Date.now();

  const dueCodes = watchlist
    .filter((item) => {
      const intervalMs = (item.priceCheckIntervalSec ?? defaultIntervalSec) * 1000;
      const lastCheckedAt = lastCheckedAtByCode.get(item.stockCode) ?? 0;
      return now - lastCheckedAt >= intervalMs;
    })
    .map((item) => item.stockCode);

  if (dueCodes.length === 0) return;

  await syncPriceHistory(db, dueCodes);
  await checkWatchlistAndNotify(db);

  for (const code of dueCodes) {
    lastCheckedAtByCode.set(code, now);
  }
}

/**
 * App 在前景時，依每檔股票各自設定的查價間隔（沒設定就用 defaultIntervalSec）
 * 輪詢。比背景任務可靠，用來補償背景任務「盡力而為、不保證頻率」的不足。
 * App 進背景/被關閉後這個 setInterval 就不會再執行。
 */
export function startForegroundPoll(defaultIntervalSec: number = DEFAULT_CHECK_INTERVAL_SEC): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    tick(defaultIntervalSec).catch((err) => {
      console.error('foreground-poll: tick failed', err);
    });
  }, TICK_INTERVAL_MS);
}

export function stopForegroundPoll(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function isForegroundPollRunning(): boolean {
  return intervalHandle !== null;
}

/** 測試/除錯用：清掉每檔股票的「上次檢查時間」記憶，讓下一個 tick 全部視為到期 */
export function resetForegroundPollState(): void {
  lastCheckedAtByCode.clear();
}
