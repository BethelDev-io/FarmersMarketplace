const { isAllowedTransition, ALLOWED_TRANSITIONS, FINAL_STATUSES } = require('../models/orderStatus');

describe('order status state machine', () => {
  test.each([
    ['pending', 'confirming'],
    ['pending', 'paid'],
    ['confirming', 'failed'],
    ['paid', 'processing'],
    ['processing', 'shipped'],
    ['shipped', 'delivered'],
    ['delivered', 'returned'],
    ['disputed', 'refunded'],
  ])('allows %s -> %s', (from, to) => {
    expect(isAllowedTransition(from, to)).toBe(true);
  });

  test.each([
    ['refunded', 'shipped'],
    ['failed', 'paid'],
    ['returned', 'delivered'],
    ['delivered', 'paid'],
    ['pending', 'shipped'],
  ])('rejects %s -> %s', (from, to) => {
    expect(isAllowedTransition(from, to)).toBe(false);
  });

  test('keeps terminal statuses explicit', () => {
    expect(FINAL_STATUSES).toEqual(expect.arrayContaining(['failed', 'refunded', 'returned', 'delivered']));
    expect(ALLOWED_TRANSITIONS.refunded).toEqual([]);
    expect(ALLOWED_TRANSITIONS.failed).toEqual([]);
  });
});
