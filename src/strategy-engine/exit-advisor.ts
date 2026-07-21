import { calculatePnl, type PnlResult, type Position } from './pnl';

export type ExitAction = 'exit_take_profit' | 'exit_stop_loss' | 'hold';

export interface ExitAdvisorConfig {
  takeProfitPercent?: number;
  stopLossPercent?: number;
}

export interface ExitAdvice {
  action: ExitAction;
  reason: string;
  pnl: PnlResult;
}

const DEFAULT_TAKE_PROFIT_PERCENT = 10;
const DEFAULT_STOP_LOSS_PERCENT = 8;

function isExitAdvisorConfig(config: unknown): config is ExitAdvisorConfig {
  if (config === undefined) return true;
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  if (c.takeProfitPercent !== undefined && typeof c.takeProfitPercent !== 'number') return false;
  if (c.stopLossPercent !== undefined && typeof c.stopLossPercent !== 'number') return false;
  return true;
}

/**
 * 出場建議：依使用者設定的停利/停損百分比（相對於持倉平均成本）判斷。
 * 報酬率達到停利門檻視為 exit_take_profit，跌破停損門檻（負值）視為
 * exit_stop_loss，兩者都沒到就 hold。停利/停損同時符合時，優先停利。
 */
export function adviseExit(
  position: Position,
  currentPrice: number,
  config?: ExitAdvisorConfig,
): ExitAdvice {
  if (!isExitAdvisorConfig(config)) {
    throw new Error(
      'exit-advisor: config 格式不正確，takeProfitPercent/stopLossPercent 必須是數字',
    );
  }
  const takeProfitPercent = config?.takeProfitPercent ?? DEFAULT_TAKE_PROFIT_PERCENT;
  const stopLossPercent = config?.stopLossPercent ?? DEFAULT_STOP_LOSS_PERCENT;

  if (!(takeProfitPercent > 0)) {
    throw new Error('exit-advisor: takeProfitPercent 必須大於 0');
  }
  if (!(stopLossPercent > 0)) {
    throw new Error('exit-advisor: stopLossPercent 必須大於 0');
  }

  const pnl = calculatePnl(position, currentPrice);

  if (pnl.returnRatePercent >= takeProfitPercent) {
    return {
      action: 'exit_take_profit',
      pnl,
      reason: `報酬率 ${pnl.returnRatePercent.toFixed(2)}% 已達停利門檻 ${takeProfitPercent}%，建議出場獲利了結`,
    };
  }

  if (pnl.returnRatePercent <= -stopLossPercent) {
    return {
      action: 'exit_stop_loss',
      pnl,
      reason: `報酬率 ${pnl.returnRatePercent.toFixed(2)}% 已跌破停損門檻 -${stopLossPercent}%，建議出場停損`,
    };
  }

  return {
    action: 'hold',
    pnl,
    reason: `報酬率 ${pnl.returnRatePercent.toFixed(2)}%，尚未達停利 ${takeProfitPercent}% 或停損 -${stopLossPercent}% 門檻，建議續抱`,
  };
}
