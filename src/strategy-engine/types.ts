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
}

export interface Strategy {
  evaluate(history: PricePoint[], config: unknown): StrategySignal;
}
