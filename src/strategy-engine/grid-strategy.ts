import type { PricePoint, Strategy, StrategySignal } from './types';

export interface GridStrategyConfig {
  anchorPrice: number;
  budget: number;
  spacingPercent: number;
  tierCount: number;
}

function isGridStrategyConfig(config: unknown): config is GridStrategyConfig {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  return (
    typeof c.anchorPrice === 'number' &&
    typeof c.budget === 'number' &&
    typeof c.spacingPercent === 'number' &&
    typeof c.tierCount === 'number'
  );
}

function validateConfig(config: GridStrategyConfig): void {
  if (!(config.anchorPrice > 0)) {
    throw new Error('grid-strategy: anchorPrice 必須大於 0');
  }
  if (!(config.budget > 0)) {
    throw new Error('grid-strategy: budget 必須大於 0');
  }
  if (!(config.spacingPercent > 0)) {
    throw new Error('grid-strategy: spacingPercent 必須大於 0');
  }
  if (!Number.isInteger(config.tierCount) || config.tierCount < 1) {
    throw new Error('grid-strategy: tierCount 必須是大於等於 1 的整數');
  }
}

function tierWeight(tier: number): number {
  return 1 + 0.5 * (tier - 1);
}

function tierTriggerPrice(config: GridStrategyConfig, tier: number): number {
  return config.anchorPrice * (1 - (tier * config.spacingPercent) / 100);
}

function tierAmount(config: GridStrategyConfig, tier: number): number {
  let weightSum = 0;
  for (let i = 1; i <= config.tierCount; i += 1) {
    weightSum += tierWeight(i);
  }
  const unitAmount = config.budget / weightSum;
  return unitAmount * tierWeight(tier);
}

/**
 * 微笑曲線網格策略：價格每跌 spacingPercent% 視為深入一檔，
 * 檔位權重依金字塔比例 1:1.5:2:2.5:3... 分配 budget（越深檔位加碼越多）。
 */
export const gridStrategy: Strategy = {
  evaluate(history: PricePoint[], config: unknown): StrategySignal {
    if (!isGridStrategyConfig(config)) {
      throw new Error(
        'grid-strategy: config 格式不正確，需要 anchorPrice/budget/spacingPercent/tierCount',
      );
    }
    validateConfig(config);

    if (history.length === 0) {
      return { triggered: false, reason: '資料不足：沒有任何價格資料，無法判斷目前價格' };
    }

    const currentPrice = history[history.length - 1].close;

    let deepestTier = 0;
    for (let tier = 1; tier <= config.tierCount; tier += 1) {
      if (currentPrice <= tierTriggerPrice(config, tier)) {
        deepestTier = tier;
      } else {
        break;
      }
    }

    if (deepestTier === 0) {
      return {
        triggered: false,
        reason: `目前價格 ${currentPrice} 尚未跌破第 1 檔門檻 ${tierTriggerPrice(config, 1).toFixed(2)}`,
      };
    }

    const amount = tierAmount(config, deepestTier);
    return {
      triggered: true,
      // 這裡只描述「跌破第幾檔門檻」的機械事實，不寫「建議投入」——是否真的建議進場
      // 要等 entry-advisor 疊加趨勢確認濾網後才能定案，寫在這裡會在濾網判定為「觀望」
      // 時跟最終建議互相矛盾（觸發文字說投入、結論卻說觀望）
      reason: `目前價格 ${currentPrice} 已跌破第 ${deepestTier} 檔門檻 ${tierTriggerPrice(config, deepestTier).toFixed(2)}`,
      tierIndex: deepestTier,
      amount,
    };
  },
};
