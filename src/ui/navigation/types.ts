/**
 * 「策略建議」畫面 → 新增標的表單的預填參數。網格與金字塔預設會一起啟用
 * （由市場狀態路由決定當天聽誰的），所以預填是一個組合物件，兩策略各帶各的參數；
 * 只帶其中一個時，表單只啟用有帶到的那個策略。
 */
export interface WatchlistFormPrefill {
  stockCode?: string;
  stockName?: string;
  budget?: number;
  grid?: {
    spacingPercent: number;
    tierCount: number;
    entryConfirmEnabled: boolean;
  };
  pyramid?: {
    /** 對應「策略建議」畫面回測用的三組加碼權重比例：等權重 [1,1,1,1]、金字塔式
     * [1,1.5,2,2.5]（越漲加越多），或遞減式 [2.5,2,1.5,1]（越漲加越少） */
    weightsProfile: 'equal' | 'pyramid' | 'decreasing';
    addTriggerPct: number;
  };
}

export type RootStackParamList = {
  Watchlist: undefined;
  WatchlistForm: { watchlistId?: number; prefill?: WatchlistFormPrefill };
  StockDetail: { watchlistId: number };
  Settings: undefined;
  StrategyRecommendation: undefined;
};
