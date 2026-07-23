import type { SQLiteDatabase } from 'expo-sqlite';

import type { MarketState, PyramidState } from '../strategy-engine/pyramid-state-machine';

interface PyramidStateRow {
  current_state: MarketState;
  candidate_state: MarketState | null;
  candidate_days: number;
  current_tier: number;
  last_add_price: number;
  stop_price: number;
  breakout_pending_days: number;
  range_high: number | null;
  range_low: number | null;
}

/**
 * 沒有任何一列代表這個策略還沒跑過第一次檢查——呼叫端傳 undefined 給 evaluatePyramid，
 * 由它自己算出初始狀態，這裡不用另外幫忙生一筆預設值。
 */
export async function getPyramidState(
  db: SQLiteDatabase,
  strategyConfigId: number,
): Promise<PyramidState | null> {
  const row = await db.getFirstAsync<PyramidStateRow>(
    `SELECT current_state, candidate_state, candidate_days, current_tier, last_add_price,
            stop_price, breakout_pending_days, range_high, range_low
     FROM pyramid_state WHERE strategy_config_id = ?`,
    [strategyConfigId],
  );
  if (!row) return null;
  return {
    currentState: row.current_state,
    candidateState: row.candidate_state,
    candidateDays: row.candidate_days,
    currentTier: row.current_tier,
    lastAddPrice: row.last_add_price,
    stopPrice: row.stop_price,
    breakoutPendingDays: row.breakout_pending_days,
    rangeHigh: row.range_high,
    rangeLow: row.range_low,
  };
}

export async function savePyramidState(
  db: SQLiteDatabase,
  strategyConfigId: number,
  state: PyramidState,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO pyramid_state
       (strategy_config_id, current_state, candidate_state, candidate_days, current_tier,
        last_add_price, stop_price, breakout_pending_days, range_high, range_low, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (strategy_config_id) DO UPDATE SET
       current_state = excluded.current_state,
       candidate_state = excluded.candidate_state,
       candidate_days = excluded.candidate_days,
       current_tier = excluded.current_tier,
       last_add_price = excluded.last_add_price,
       stop_price = excluded.stop_price,
       breakout_pending_days = excluded.breakout_pending_days,
       range_high = excluded.range_high,
       range_low = excluded.range_low,
       updated_at = excluded.updated_at`,
    [
      strategyConfigId,
      state.currentState,
      state.candidateState,
      state.candidateDays,
      state.currentTier,
      state.lastAddPrice,
      state.stopPrice,
      state.breakoutPendingDays,
      state.rangeHigh,
      state.rangeLow,
    ],
  );
}
