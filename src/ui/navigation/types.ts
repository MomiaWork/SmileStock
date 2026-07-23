export interface GridPrefill {
  strategyType: 'grid';
  stockCode?: string;
  stockName?: string;
  spacingPercent: number;
  tierCount: number;
  entryConfirmEnabled: boolean;
  takeProfitPercent: number;
  stopLossPercent: number;
}

export interface PyramidPrefill {
  strategyType: 'pyramid';
  stockCode?: string;
  stockName?: string;
  /** 對應「策略建議」畫面回測用的兩組加碼權重比例：等權重 [1,1,1,1] 或金字塔式 [1,1.5,2,2.5] */
  weightsProfile: 'equal' | 'pyramid';
  addTriggerPct: number;
  hardStopPct: number;
}

export type WatchlistFormPrefill = GridPrefill | PyramidPrefill;

export type RootStackParamList = {
  Watchlist: undefined;
  WatchlistForm: { watchlistId?: number; prefill?: WatchlistFormPrefill };
  StockDetail: { watchlistId: number };
  Settings: undefined;
  StrategyRecommendation: undefined;
};
