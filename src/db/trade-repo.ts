import type { SQLiteDatabase } from 'expo-sqlite';

import type { Position } from '../strategy-engine/pnl';

export type TradeSide = 'buy' | 'sell';

export interface Trade {
  id: number;
  watchlistId: number;
  side: TradeSide;
  price: number;
  quantity: number;
  tradedAt: string;
  note: string | null;
}

export interface NewTrade {
  watchlistId: number;
  side: TradeSide;
  price: number;
  quantity: number;
  note?: string | null;
}

function mapTradeRow(row: {
  id: number;
  watchlist_id: number;
  side: TradeSide;
  price: number;
  quantity: number;
  traded_at: string;
  note: string | null;
}): Trade {
  return {
    id: row.id,
    watchlistId: row.watchlist_id,
    side: row.side,
    price: row.price,
    quantity: row.quantity,
    tradedAt: row.traded_at,
    note: row.note,
  };
}

export async function getTrades(db: SQLiteDatabase, watchlistId: number): Promise<Trade[]> {
  const rows = await db.getAllAsync<{
    id: number;
    watchlist_id: number;
    side: TradeSide;
    price: number;
    quantity: number;
    traded_at: string;
    note: string | null;
  }>(
    `SELECT id, watchlist_id, side, price, quantity, traded_at, note FROM trades
     WHERE watchlist_id = ? ORDER BY traded_at ASC, id ASC`,
    [watchlistId],
  );
  return rows.map(mapTradeRow);
}

/**
 * 依交易記錄算出目前持倉股數與加權平均成本。買入依比例併入平均成本，
 * 賣出只減少股數、不改變平均成本（未實現損益之後用 avgCost 跟現價比）。
 * 全部賣光（quantity 歸零）視為沒有持倉，回傳 null。
 */
export function computePosition(trades: Trade[]): Position | null {
  let quantity = 0;
  let avgCost = 0;

  for (const trade of trades) {
    if (trade.side === 'buy') {
      const totalCost = avgCost * quantity + trade.price * trade.quantity;
      quantity += trade.quantity;
      avgCost = quantity > 0 ? totalCost / quantity : 0;
    } else {
      quantity -= trade.quantity;
    }
  }

  if (quantity <= 0) return null;
  return { quantity, avgCost };
}

export async function getCurrentPosition(
  db: SQLiteDatabase,
  watchlistId: number,
): Promise<Position | null> {
  const trades = await getTrades(db, watchlistId);
  return computePosition(trades);
}

/**
 * 新增一筆交易記錄（使用者手動確認已在券商完成的買賣，App 不代下單）。
 * 賣出數量超過目前持倉一律視為資料輸入錯誤，丟明確錯誤，不允許賣出變成負持倉。
 */
export async function addTrade(db: SQLiteDatabase, trade: NewTrade): Promise<number> {
  if (!(trade.price > 0)) {
    throw new Error('trade-repo: price 必須大於 0');
  }
  if (!(trade.quantity > 0)) {
    throw new Error('trade-repo: quantity 必須大於 0');
  }

  if (trade.side === 'sell') {
    const current = await getCurrentPosition(db, trade.watchlistId);
    const heldQuantity = current?.quantity ?? 0;
    if (trade.quantity > heldQuantity) {
      throw new Error(`trade-repo: 賣出數量 ${trade.quantity} 超過目前持有 ${heldQuantity} 股`);
    }
  }

  const result = await db.runAsync(
    `INSERT INTO trades (watchlist_id, side, price, quantity, note) VALUES (?, ?, ?, ?, ?)`,
    [trade.watchlistId, trade.side, trade.price, trade.quantity, trade.note ?? null],
  );
  return result.lastInsertRowId;
}
