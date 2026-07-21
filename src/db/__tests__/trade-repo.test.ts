import { computePosition, type Trade } from '../trade-repo';

function trade(overrides: Partial<Trade> & Pick<Trade, 'side' | 'price' | 'quantity'>): Trade {
  return {
    id: 0,
    watchlistId: 1,
    tradedAt: '2026-07-21',
    note: null,
    ...overrides,
  };
}

describe('computePosition', () => {
  test('沒有任何交易時回傳 null', () => {
    expect(computePosition([])).toBeNull();
  });

  test('單筆買入時平均成本等於買入價', () => {
    const position = computePosition([trade({ side: 'buy', price: 100, quantity: 10 })]);
    expect(position).toEqual({ quantity: 10, avgCost: 100 });
  });

  test('分批買入時依股數加權平均成本', () => {
    const position = computePosition([
      trade({ side: 'buy', price: 100, quantity: 10 }),
      trade({ side: 'buy', price: 80, quantity: 10 }),
    ]);
    expect(position?.quantity).toBe(20);
    expect(position?.avgCost).toBeCloseTo(90);
  });

  test('賣出只減少股數，不改變平均成本', () => {
    const position = computePosition([
      trade({ side: 'buy', price: 100, quantity: 20 }),
      trade({ side: 'sell', price: 120, quantity: 5 }),
    ]);
    expect(position?.quantity).toBe(15);
    expect(position?.avgCost).toBe(100);
  });

  test('全部賣光（股數剛好歸零）視為沒有持倉', () => {
    const position = computePosition([
      trade({ side: 'buy', price: 100, quantity: 10 }),
      trade({ side: 'sell', price: 110, quantity: 10 }),
    ]);
    expect(position).toBeNull();
  });
});
