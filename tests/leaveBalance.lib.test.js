const { computeBalance } = require('../lib/leaveBalance');

const YEAR = new Date().getFullYear();

test('single year — no use, no adjustments', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 0, adjustments: 0 }))
    .toEqual({ grantsEarned: 10, used: 0, adjustments: 0, balance: 10 });
});

test('multi-year carry-over accumulates', () => {
  expect(computeBalance({ hireYear: YEAR - 2, currentYear: YEAR, used: 0, adjustments: 0 }))
    .toEqual({ grantsEarned: 30, used: 0, adjustments: 0, balance: 30 });
});

test('used days reduce balance', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 4, adjustments: 0 }))
    .toEqual({ grantsEarned: 10, used: 4, adjustments: 0, balance: 6 });
});

test('positive adjustment adds days', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 0, adjustments: 3 }))
    .toEqual({ grantsEarned: 10, used: 0, adjustments: 3, balance: 13 });
});

test('negative adjustment deducts days', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 0, adjustments: -5 }))
    .toEqual({ grantsEarned: 10, used: 0, adjustments: -5, balance: 5 });
});

test('balance can go negative when overused', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 12, adjustments: 0 }))
    .toEqual({ grantsEarned: 10, used: 12, adjustments: 0, balance: -2 });
});
