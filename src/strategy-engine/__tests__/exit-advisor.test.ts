import { adviseExit } from '../exit-advisor';

const position = { quantity: 10, avgCost: 100 };
const config = { takeProfitPercent: 10, stopLossPercent: 8 };

describe('adviseExit', () => {
  test('報酬率剛好等於停利門檻時建議停利出場', () => {
    const advice = adviseExit(position, 110, config);
    expect(advice.action).toBe('exit_take_profit');
  });

  test('報酬率超過停利門檻時建議停利出場', () => {
    const advice = adviseExit(position, 120, config);
    expect(advice.action).toBe('exit_take_profit');
  });

  test('報酬率剛好等於停損門檻時建議停損出場', () => {
    const advice = adviseExit(position, 92, config);
    expect(advice.action).toBe('exit_stop_loss');
  });

  test('報酬率跌破停損門檻時建議停損出場', () => {
    const advice = adviseExit(position, 80, config);
    expect(advice.action).toBe('exit_stop_loss');
  });

  test('報酬率介於停利停損之間時建議續抱', () => {
    const advice = adviseExit(position, 103, config);
    expect(advice.action).toBe('hold');
  });

  test('takeProfitPercent 不是正數時丟出明確錯誤', () => {
    expect(() => adviseExit(position, 100, { takeProfitPercent: 0 })).toThrow();
  });

  test('stopLossPercent 不是正數時丟出明確錯誤', () => {
    expect(() => adviseExit(position, 100, { stopLossPercent: -1 })).toThrow();
  });
});

describe('adviseExit 搭配 regime context（金字塔市場狀態）', () => {
  test('上升趨勢中報酬率已超過固定停利門檻，但棘輪停損未跌破 → 續抱，不強制停利', () => {
    // 報酬率 20%，遠超過固定停利門檻 10%，但這裡改用趨勢的棘輪停損判斷
    const advice = adviseExit(position, 120, config, {
      state: 'TRENDING_UP',
      stopPrice: 110,
      dataSufficient: true,
    });
    expect(advice.action).toBe('hold');
    expect(advice.reason).toContain('續抱');
  });

  test('上升趨勢中價格跌破棘輪停損 → 停損出場，即使報酬率仍是正的', () => {
    const advice = adviseExit(position, 108, config, {
      state: 'TRENDING_UP',
      stopPrice: 110,
      dataSufficient: true,
    });
    expect(advice.action).toBe('exit_stop_loss');
    expect(advice.reason).toContain('移動停損');
  });

  test('向上突破狀態下同樣採用棘輪停損判斷', () => {
    const advice = adviseExit(position, 130, config, {
      state: 'BREAKOUT_UP',
      stopPrice: 120,
      dataSufficient: true,
    });
    expect(advice.action).toBe('hold');
  });

  test('盤整狀態仍退回固定 % 判斷（盤整區間本身有清楚上下緣）', () => {
    const advice = adviseExit(position, 120, config, {
      state: 'CONSOLIDATION',
      stopPrice: 90,
      dataSufficient: true,
    });
    expect(advice.action).toBe('exit_take_profit');
  });

  test('金字塔資料還不足（dataSufficient 為 false）時退回固定 % 判斷', () => {
    const advice = adviseExit(position, 120, config, {
      state: 'TRENDING_UP',
      stopPrice: 90,
      dataSufficient: false,
    });
    expect(advice.action).toBe('exit_take_profit');
  });

  test('沒有 regime context 時行為與原本固定 % 邏輯一致', () => {
    const advice = adviseExit(position, 120, config);
    expect(advice.action).toBe('exit_take_profit');
  });
});
