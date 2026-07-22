export interface WatchlistFormPrefill {
  stockCode?: string;
  spacingPercent: number;
  tierCount: number;
  entryConfirmEnabled: boolean;
  takeProfitPercent: number;
  stopLossPercent: number;
}

export type RootStackParamList = {
  Watchlist: undefined;
  WatchlistForm: { watchlistId?: number; prefill?: WatchlistFormPrefill };
  StockDetail: { watchlistId: number };
  Settings: undefined;
  StrategyRecommendation: undefined;
};
