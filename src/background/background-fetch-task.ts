import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { getMeta, setMeta } from '../db/app-meta-repo';
import { getDb } from '../db/schema';
import { syncPriceHistory } from '../data-fetch/price-history-sync';
import { checkWatchlistAndNotify } from '../notifications/run-check';
import { getWatchlist } from '../db/watchlist-repo';

export const BACKGROUND_TASK_NAME = 'smilestock-background-check';

const LAST_RUN_AT_KEY = 'background_last_run_at';
const LAST_RESULT_KEY = 'background_last_result';

/**
 * 背景任務內容：抓最新收盤價寫入 DB -> 跑策略檢查 -> 觸發就發通知。
 * 這是 Phase 2（price-history-sync）+ Phase 3（run-check）邏輯的重用，不重寫。
 *
 * defineTask 必須在 App 啟動時就無條件執行過一次（見 index.ts），系統才能在
 * App 被系統回收後、於背景喚醒時找到這個任務名稱並執行它。
 */
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  const db = await getDb();
  try {
    const watchlist = await getWatchlist(db);
    const stockCodes = watchlist.map((item) => item.stockCode);

    if (stockCodes.length > 0) {
      await syncPriceHistory(db, stockCodes);
    }
    await checkWatchlistAndNotify(db);

    await setMeta(db, LAST_RUN_AT_KEY, new Date().toISOString());
    await setMeta(db, LAST_RESULT_KEY, 'success');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    await setMeta(db, LAST_RUN_AT_KEY, new Date().toISOString());
    await setMeta(
      db,
      LAST_RESULT_KEY,
      `failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * 嘗試向系統註冊背景任務。系統只會「盡力而為」呼叫它，實際頻率完全由 OS 控制，
 * 不保證固定間隔、也可能長時間完全不執行。minimumInterval 只是最小間隔提示。
 */
export async function registerBackgroundTaskAsync(): Promise<void> {
  await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
    minimumInterval: 15, // 分鐘，系統允許的最小值；實際觸發間隔由系統決定
  });
}

export async function unregisterBackgroundTaskAsync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME)) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
  }
}

export async function getBackgroundTaskStatusAsync(): Promise<BackgroundTask.BackgroundTaskStatus> {
  return BackgroundTask.getStatusAsync();
}

export interface LastBackgroundRunInfo {
  lastRunAt: string | null;
  lastResult: string | null;
}

export async function getLastBackgroundRunInfo(): Promise<LastBackgroundRunInfo> {
  const db = await getDb();
  const [lastRunAt, lastResult] = await Promise.all([
    getMeta(db, LAST_RUN_AT_KEY),
    getMeta(db, LAST_RESULT_KEY),
  ]);
  return { lastRunAt, lastResult };
}
