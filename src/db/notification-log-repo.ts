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

export interface NotificationHistoryEntry {
  id: number;
  strategyConfigId: number;
  strategyType: string;
  signalKey: string;
  sentAt: string;
}

/** 個股詳情頁用：這檔標的過去所有已發送過的觸發紀錄，最新的在前面 */
export async function getNotificationHistory(
  db: SQLiteDatabase,
  watchlistId: number,
): Promise<NotificationHistoryEntry[]> {
  const rows = await db.getAllAsync<{
    id: number;
    strategy_config_id: number;
    strategy_type: string;
    signal_key: string;
    sent_at: string;
  }>(
    `SELECT nl.id, nl.strategy_config_id, sc.type as strategy_type, nl.signal_key, nl.sent_at
     FROM notification_log nl
     JOIN strategy_config sc ON sc.id = nl.strategy_config_id
     WHERE nl.watchlist_id = ?
     ORDER BY nl.sent_at DESC`,
    [watchlistId],
  );

  return rows.map((row) => ({
    id: row.id,
    strategyConfigId: row.strategy_config_id,
    strategyType: row.strategy_type,
    signalKey: row.signal_key,
    sentAt: row.sent_at,
  }));
}

export interface AllNotificationHistoryEntry extends NotificationHistoryEntry {
  watchlistId: number;
  stockCode: string;
  stockName: string;
}

/** 通知記錄總覽頁用：所有標的的通知發送紀錄合併在一起，最新的在前面 */
export async function getAllNotificationHistory(
  db: SQLiteDatabase,
  limit = 200,
): Promise<AllNotificationHistoryEntry[]> {
  const rows = await db.getAllAsync<{
    id: number;
    watchlist_id: number;
    stock_code: string;
    stock_name: string;
    strategy_config_id: number;
    strategy_type: string;
    signal_key: string;
    sent_at: string;
  }>(
    `SELECT nl.id, nl.watchlist_id, w.stock_code, w.stock_name,
            nl.strategy_config_id, sc.type as strategy_type, nl.signal_key, nl.sent_at
     FROM notification_log nl
     JOIN strategy_config sc ON sc.id = nl.strategy_config_id
     JOIN watchlist w ON w.id = nl.watchlist_id
     ORDER BY nl.sent_at DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map((row) => ({
    id: row.id,
    watchlistId: row.watchlist_id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    strategyConfigId: row.strategy_config_id,
    strategyType: row.strategy_type,
    signalKey: row.signal_key,
    sentAt: row.sent_at,
  }));
}
