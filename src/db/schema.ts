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
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS strategy_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('grid', 'rsi', 'ma_cross', 'pyramid')),
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

    CREATE TABLE IF NOT EXISTS pyramid_state (
      strategy_config_id INTEGER PRIMARY KEY REFERENCES strategy_config(id) ON DELETE CASCADE,
      current_state TEXT NOT NULL,
      candidate_state TEXT,
      candidate_days INTEGER NOT NULL,
      current_tier INTEGER NOT NULL,
      last_add_price REAL NOT NULL,
      stop_price REAL NOT NULL,
      breakout_pending_days INTEGER NOT NULL,
      range_high REAL,
      range_low REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  // 新裝置由 CREATE TABLE 直接帶 sort_order；已安裝過舊版的裝置補上這欄後全部
  // 預設 0，排序時用 sort_order 為主、id 為輔（見 watchlist-repo.ts 的 getWatchlist），
  // 全 0 時等同照舊用 id 排序，不會打亂既有清單順序，使用者按過「上移/下移」後才會
  // 出現不同的 sort_order 值
  await ensureColumn(db, 'watchlist', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');
  await ensureStrategyConfigAllowsPyramid(db);
}

/**
 * strategy_config.type 的 CHECK 約束是建表當下就固定的，不像欄位可以用 ALTER TABLE
 * ADD COLUMN 補上——已安裝過舊版 schema（type 只允許 grid/rsi/ma_cross）的裝置，
 * 直接寫入 'pyramid' 會被 CHECK 擋下。改成 rename → 依新 CHECK 建表 → 搬資料 → 刪舊表，
 * 且暫時關閉 foreign_keys 避免搬資料過程中 grid_tiers/notification_log 的 FK 檢查誤判。
 * 用 sqlite_master 裡的建表語句判斷是否已經是新版，避免每次啟動都重跑一次遷移。
 */
async function ensureStrategyConfigAllowsPyramid(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'strategy_config'`,
  );
  if (!row || row.sql.includes('pyramid')) return;

  await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`ALTER TABLE strategy_config RENAME TO strategy_config_old`);
      await db.execAsync(`
        CREATE TABLE strategy_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('grid', 'rsi', 'ma_cross', 'pyramid')),
          params TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      await db.execAsync(
        `INSERT INTO strategy_config SELECT id, watchlist_id, type, params, enabled, created_at FROM strategy_config_old`,
      );
      await db.execAsync(`DROP TABLE strategy_config_old`);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON');
  }
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
