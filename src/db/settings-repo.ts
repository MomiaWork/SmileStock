import type { SQLiteDatabase } from 'expo-sqlite';

import { getMeta, setMeta } from './app-meta-repo';

const GLOBAL_DEFAULT_INTERVAL_KEY = 'global_default_interval_sec';
export const DEFAULT_GLOBAL_INTERVAL_SEC = 300;

export async function getGlobalDefaultIntervalSec(db: SQLiteDatabase): Promise<number> {
  const value = await getMeta(db, GLOBAL_DEFAULT_INTERVAL_KEY);
  if (value === null) return DEFAULT_GLOBAL_INTERVAL_SEC;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GLOBAL_INTERVAL_SEC;
}

export async function setGlobalDefaultIntervalSec(
  db: SQLiteDatabase,
  intervalSec: number,
): Promise<void> {
  await setMeta(db, GLOBAL_DEFAULT_INTERVAL_KEY, String(intervalSec));
}

const CLAUDE_SHORTCUT_NAME_KEY = 'claude_shortcut_name';
export const DEFAULT_CLAUDE_SHORTCUT_NAME = '用Claude分析持股';

/** 「Claude 分析」按鈕要執行的 iOS 捷徑名稱，必須與捷徑 App 內的名稱完全一致 */
export async function getClaudeShortcutName(db: SQLiteDatabase): Promise<string> {
  const value = await getMeta(db, CLAUDE_SHORTCUT_NAME_KEY);
  return value !== null && value.trim() !== '' ? value : DEFAULT_CLAUDE_SHORTCUT_NAME;
}

export async function setClaudeShortcutName(db: SQLiteDatabase, name: string): Promise<void> {
  await setMeta(db, CLAUDE_SHORTCUT_NAME_KEY, name.trim());
}
