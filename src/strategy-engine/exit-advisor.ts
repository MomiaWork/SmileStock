import { calculatePnl, type PnlResult, type Position } from './pnl';
import { MARKET_STATE_LABEL, type MarketState } from './pyramid-state-machine';

export type ExitAction = 'exit_take_profit' | 'exit_stop_loss' | 'hold';

export interface ExitAdvisorConfig {
  takeProfitPercent?: number;
  stopLossPercent?: number;
}

/**
 * 金字塔狀態機算出的市場狀態與棘輪式移動停損價（只上移不下移），用來讓持倉出場
 * 建議跟「今天該做的事」卡片（recommendation-router）採同一套動態判斷，而不是自己
 * 另外套一組跟走勢無關的固定 % 門檻。dataSufficient 為 false（金字塔仍在
 * insufficient_data 階段、市場狀態還不可信）時視同沒有這個 context，退回固定 % 邏輯。
 */
export interface ExitRegimeContext {
  state: MarketState;
  stopPrice: number;
  dataSufficient: boolean;
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

function adviseByFixedPercent(
  pnl: PnlResult,
  takeProfitPercent: number,
  stopLossPercent: number,
): { action: ExitAction; reason: string } {
  if (pnl.returnRatePercent >= takeProfitPercent) {
    return {
      action: 'exit_take_profit',
      reason: `報酬率 ${pnl.returnRatePercent.toFixed(2)}% 已達停利門檻 ${takeProfitPercent}%，建議出場獲利了結`,
    };
  }

  if (pnl.returnRatePercent <= -stopLossPercent) {
    return {
      action: 'exit_stop_loss',
      reason: `報酬率 ${pnl.returnRatePercent.toFixed(2)}% 已跌破停損門檻 -${stopLossPercent}%，建議出場停損`,
    };
  }

  return {
    action: 'hold',
    reason: `報酬率 ${pnl.returnRatePercent.toFixed(2)}%，尚未達停利 ${takeProfitPercent}% 或停損 -${stopLossPercent}% 門檻，建議續抱`,
  };
}

/**
 * 趨勢／突破狀態下不設固定停利點：只要棘輪式移動停損沒被跌破，就算報酬率已經
 * 超過過去的固定門檻也續抱，避免正常回檔被錯誤地當成出場訊號（見
 * docs/pyramid-state-machine-spec.md revision #8 的理由，這裡套用到持倉出場提醒）。
 */
function adviseByRegime(
  currentPrice: number,
  pnl: PnlResult,
  regime: ExitRegimeContext,
): { action: ExitAction; reason: string } {
  const stateLabel = MARKET_STATE_LABEL[regime.state];

  if (currentPrice <= regime.stopPrice) {
    return {
      action: 'exit_stop_loss',
      reason: `目前價格 ${currentPrice} 已跌破${stateLabel}的移動停損 ${regime.stopPrice.toFixed(2)}（棘輪式只上移不下移），建議出場停損，目前報酬率 ${pnl.returnRatePercent.toFixed(2)}%`,
    };
  }

  return {
    action: 'hold',
    reason: `${stateLabel}持續，防守停損在 ${regime.stopPrice.toFixed(2)}（隨走勢動態上移），續抱不設固定停利點，目前報酬率 ${pnl.returnRatePercent.toFixed(2)}%`,
  };
}

/**
 * 出場建議。金字塔狀態機判斷市場處於趨勢或突破狀態、且狀態可信（非
 * insufficient_data）時，改用棘輪式移動停損動態判斷（跌破才出場，不設固定停利點）；
 * 盤整、沒有可信市場狀態（未啟用金字塔策略、或資料還在累積中）時，退回使用者設定的
 * 固定停利/停損 % 當備援——盤整區間本身就有清楚的上下緣，固定門檻在這個狀態下仍合理。
 */
export function adviseExit(
  position: Position,
  currentPrice: number,
  config?: ExitAdvisorConfig,
  regime?: ExitRegimeContext,
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

  const useRegime = regime?.dataSufficient && regime.state !== 'CONSOLIDATION';
  const { action, reason } = useRegime
    ? adviseByRegime(currentPrice, pnl, regime)
    : adviseByFixedPercent(pnl, takeProfitPercent, stopLossPercent);

  return { action, reason, pnl };
}
