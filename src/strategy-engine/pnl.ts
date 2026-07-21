export interface Position {
  quantity: number;
  avgCost: number;
}

export interface PnlResult {
  marketValue: number;
  costBasis: number;
  pnl: number;
  returnRatePercent: number;
}

function validatePosition(position: Position): void {
  if (!(position.quantity > 0)) {
    throw new Error('pnl: quantity 必須大於 0');
  }
  if (!(position.avgCost > 0)) {
    throw new Error('pnl: avgCost 必須大於 0');
  }
}

/**
 * 計算持倉的未實現損益與報酬率。avgCost 用加權平均成本法計算
 * （由交易記錄的買入單加權平均得出，見 trade-repo）。
 */
export function calculatePnl(position: Position, currentPrice: number): PnlResult {
  validatePosition(position);
  if (!(currentPrice > 0)) {
    throw new Error('pnl: currentPrice 必須大於 0');
  }

  const costBasis = position.avgCost * position.quantity;
  const marketValue = currentPrice * position.quantity;
  const pnl = marketValue - costBasis;
  const returnRatePercent = (pnl / costBasis) * 100;

  return { marketValue, costBasis, pnl, returnRatePercent };
}
