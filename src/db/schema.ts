import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'smilestock.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await initSchema(db);
      return db;
    });
  }
  return dbPromise;
}

export async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL UNIQUE,
      stock_name TEXT NOT NULL,
      budget REAL NOT NULL,
      price_check_interval_sec INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS strategy_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('grid', 'rsi', 'ma_cross')),
      params TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      date TEXT NOT NULL,
      close REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      volume REAL NOT NULL,
      UNIQUE (stock_code, date)
    );

    CREATE TABLE IF NOT EXISTS grid_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_config_id INTEGER NOT NULL REFERENCES strategy_config(id) ON DELETE CASCADE,
      tier_index INTEGER NOT NULL,
      trigger_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE (strategy_config_id, tier_index)
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
      strategy_config_id INTEGER NOT NULL REFERENCES strategy_config(id) ON DELETE CASCADE,
      signal_key TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (watchlist_id, strategy_config_id, signal_key)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
      side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      price REAL NOT NULL,
      quantity REAL NOT NULL,
      traded_at TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT
    );
  `);

  // watchlist 是既有資料表，新欄位不能靠 CREATE TABLE IF NOT EXISTS 補上，
  // 已安裝過舊版 schema 的裝置要用 ALTER TABLE 補齊，先檢查欄位是否存在避免重複新增。
  await ensureColumn(db, 'watchlist', 'take_profit_percent', 'take_profit_percent REAL');
  await ensureColumn(db, 'watchlist', 'stop_loss_percent', 'stop_loss_percent REAL');
  await ensureColumn(
    db,
    'watchlist',
    'entry_confirm_enabled',
    'entry_confirm_enabled INTEGER NOT NULL DEFAULT 0',
  );
}

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  columnDdl: string,
): Promise<void> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  const exists = rows.some((row) => row.name === column);
  if (!exists) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`);
  }
}
