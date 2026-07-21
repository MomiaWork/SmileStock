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
