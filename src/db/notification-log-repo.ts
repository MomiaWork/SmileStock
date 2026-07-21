import type { SQLiteDatabase } from 'expo-sqlite';

export async function hasBeenNotified(
  db: SQLiteDatabase,
  watchlistId: number,
  strategyConfigId: number,
  signalKey: string,
): Promise<boolean> {
  const row = await db.getFirstAsync(
    `SELECT id FROM notification_log
     WHERE watchlist_id = ? AND strategy_config_id = ? AND signal_key = ?`,
    [watchlistId, strategyConfigId, signalKey],
  );
  return row !== null;
}

/**
 * 記錄已發送的訊號。同一個 (watchlist_id, strategy_config_id, signal_key)
 * 只會有一筆（schema 有 UNIQUE 約束），重複呼叫用 INSERT OR IGNORE 靜默忽略。
 */
export async function recordNotification(
  db: SQLiteDatabase,
  watchlistId: number,
  strategyConfigId: number,
  signalKey: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO notification_log (watchlist_id, strategy_config_id, signal_key)
     VALUES (?, ?, ?)`,
    [watchlistId, strategyConfigId, signalKey],
  );
}
