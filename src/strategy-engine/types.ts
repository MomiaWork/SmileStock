export interface PricePoint {
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface StrategySignal {
  triggered: boolean;
  reason: string;
  tierIndex?: number;
  /** 建議投入金額（目前僅網格策略觸發時提供，依預算與檔位權重算出） */
  amount?: number;
}

export interface Strategy {
  evaluate(history: PricePoint[], config: unknown): StrategySignal;
}
