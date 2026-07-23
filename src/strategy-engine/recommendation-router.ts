import { adviseEntry, type EntryAdvisorOptions } from './entry-advisor';
import {
  evaluatePyramid,
  MARKET_STATE_LABEL,
  type MarketState,
  type PyramidConfig,
  type PyramidState,
} from './pyramid-state-machine';
import type { PricePoint } from './types';

export type RecommendedAction =
  'enter' | 'add' | 'exit' | 'wait' | 'freeze' | 'hold' | 'no_signal' | 'insufficient_data';

export interface RoutedRecommendation {
  /** 這次顯示的建議是依哪個策略判斷出來的 */
  source: 'grid' | 'pyramid';
  /** 判斷當下用的市場狀態，兩策略都啟用時才有意義；只開一個策略時為 null */
  regime: MarketState | null;
  action: RecommendedAction;
  amount?: number;
  tierIndex?: number;
  stopPrice?: number;
  reason: string;
}

/**
 * 同一檔股票如果「微笑曲線網格」與「金字塔加碼」同時啟用，兩者對同一天的價格可能給出
 * 互相矛盾的建議（網格說買、金字塔說凍結），且兩邊各自都用同一份預算算部位大小，同時
 * 執行會超支。這裡用金字塔狀態機已經算好、且有連續天數確認防抖動的市場狀態當路由器，
 * 同一天只讓一個策略的建議出現、只有它動用預算，其餘完全不顯示：
 *
 *   - 金字塔判斷為出場（跌破棘輪式移動停損）→ 不論趨勢，優先顯示出場，保護資金優先於
 *     找新進場點
 *   - 盤整 → 依網格（微笑曲線）建議
 *   - 上升趨勢／向上突破 → 依金字塔加碼建議
 *   - 下降趨勢／向下突破 → 兩策略都不建議投入新資金，明確顯示「不進場」
 *   - 資料還不足以判斷市場狀態（例如剛加入不久）→ 暫時退回依網格建議，並註明趨勢判斷還
 *     在累積中
 *
 * 只開其中一個策略時，直接透傳該策略自己的建議，不套用以上路由規則（regime 回傳 null，
 * 呼叫端可以照舊只顯示這一個策略的狀態）。兩個都沒開則回傳 null，交給呼叫端維持原本
 * 「沒有啟用任何策略」的顯示邏輯。
 */
export function routeRecommendation(
  history: PricePoint[],
  gridConfig: { type: 'grid'; params: unknown } | null,
  pyramidConfig: PyramidConfig | null,
  pyramidPrevState: PyramidState | undefined,
  entryAdvisorOptions?: EntryAdvisorOptions,
): RoutedRecommendation | null {
  const gridAdvice = gridConfig ? adviseEntry(history, gridConfig, entryAdvisorOptions) : null;
  const pyramidResult = pyramidConfig
    ? evaluatePyramid(history, pyramidConfig, pyramidPrevState)
    : null;

  if (!gridAdvice && !pyramidResult) return null;

  if (gridAdvice && !pyramidResult) {
    return {
      source: 'grid',
      regime: null,
      action: gridAdvice.action,
      amount: gridAdvice.amount,
      tierIndex: gridAdvice.tierIndex,
      reason: gridAdvice.reason,
    };
  }

  if (pyramidResult && !gridAdvice) {
    const s = pyramidResult.signal;
    return {
      source: 'pyramid',
      regime: null,
      action: s.action,
      amount: s.amount,
      tierIndex: s.tierIndex,
      stopPrice: s.stopPrice,
      reason: s.reason,
    };
  }

  // 以下兩者都有值（TypeScript 無法從上面的 early return 推導，用非空斷言收斂型別）
  const advice = gridAdvice!;
  const pSignal = pyramidResult!.signal;

  if (pSignal.action === 'exit') {
    return {
      source: 'pyramid',
      regime: pSignal.state,
      action: 'exit',
      stopPrice: pSignal.stopPrice,
      reason: `【優先出場】${pSignal.reason}`,
    };
  }

  if (pSignal.action === 'insufficient_data') {
    return {
      source: 'grid',
      regime: null,
      action: advice.action,
      amount: advice.amount,
      tierIndex: advice.tierIndex,
      reason: `趨勢研判資料還在累積中（${pSignal.reason}），暫時依微笑曲線網格判斷：${advice.reason}`,
    };
  }

  switch (pSignal.state) {
    case 'CONSOLIDATION':
      return {
        source: 'grid',
        regime: pSignal.state,
        action: advice.action,
        amount: advice.amount,
        tierIndex: advice.tierIndex,
        reason: `目前研判為${MARKET_STATE_LABEL.CONSOLIDATION}，依微笑曲線網格判斷：${advice.reason}`,
      };

    case 'TRENDING_UP':
    case 'BREAKOUT_UP':
      return {
        source: 'pyramid',
        regime: pSignal.state,
        action: pSignal.action,
        amount: pSignal.amount,
        tierIndex: pSignal.tierIndex,
        stopPrice: pSignal.stopPrice,
        reason: `目前研判為${MARKET_STATE_LABEL[pSignal.state]}，依金字塔加碼判斷：${pSignal.reason}`,
      };

    // 兩策略都不建議投入新資金，但金字塔的棘輪停損仍持續追蹤既有部位
    case 'TRENDING_DOWN':
    case 'BREAKOUT_DOWN':
      return {
        source: 'pyramid',
        regime: pSignal.state,
        action: 'wait',
        stopPrice: pSignal.stopPrice,
        reason: `目前研判為${MARKET_STATE_LABEL[pSignal.state]}，網格與金字塔都不建議投入新資金，請等待止穩訊號；既有部位的停損維持在 ${pSignal.stopPrice.toFixed(2)}`,
      };

    default: {
      const exhaustiveCheck: never = pSignal.state;
      throw new Error(`recommendation-router: 未知的市場狀態 ${String(exhaustiveCheck)}`);
    }
  }
}
