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
