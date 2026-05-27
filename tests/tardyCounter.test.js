const { countTardiness } = require('../lib/tardyCounter');

// Fixed reference date: Wednesday 2026-05-27
const REF = new Date('2026-05-27T00:00:00.000Z');

function makeRow(date, late_status) {
  return { date, late_status };
}

describe('countTardiness — window calculation', () => {
  test('returns all zeros for empty attendance rows', () => {
    const result = countTardiness([], [], 30, REF);
    expect(result).toEqual({ minor: 0, major: 0, awolHalf: 0, awolFull: 0, workingDaysInWindow: 30 });
  });

  test('workingDaysInWindow is exactly 30', () => {
    const { workingDaysInWindow } = countTardiness([], [], 30, REF);
    expect(workingDaysInWindow).toBe(30);
  });

  test('skips Saturday attendance rows (weekend)', () => {
    // 2026-05-23 is a Saturday — should not be counted even if in the ~45-day calendar window
    const rows = [makeRow('2026-05-23', 'MINOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.minor).toBe(0);
  });

  test('skips Sunday attendance rows (weekend)', () => {
    const rows = [makeRow('2026-05-24', 'MAJOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.major).toBe(0);
  });

  test('skips rows on country holidays', () => {
    // 2026-05-26 is a Tuesday (working day) but we mark it as a holiday
    const holidays = ['2026-05-26'];
    const rows = [makeRow('2026-05-26', 'MINOR TARDY')];
    const result = countTardiness(rows, holidays, 30, REF);
    expect(result.minor).toBe(0);
  });

  test('counts rows on non-holiday weekdays', () => {
    // 2026-05-27 is Wednesday (REF itself) and a working day
    const rows = [makeRow('2026-05-27', 'MINOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.minor).toBe(1);
  });

  test('skips rows outside the 30-working-day window', () => {
    // Date well before the window (90 calendar days back)
    const rows = [makeRow('2026-03-01', 'MAJOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.major).toBe(0);
  });
});

describe('countTardiness — late_status mapping', () => {
  test('counts MINOR TARDY correctly', () => {
    const rows = [makeRow('2026-05-27', 'MINOR TARDY'), makeRow('2026-05-26', 'MINOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.minor).toBe(2);
    expect(result.major).toBe(0);
    expect(result.awolHalf).toBe(0);
    expect(result.awolFull).toBe(0);
  });

  test('counts MAJOR TARDY correctly', () => {
    const rows = [makeRow('2026-05-27', 'MAJOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.major).toBe(1);
  });

  test('counts AWOL HALF DAY correctly', () => {
    const rows = [makeRow('2026-05-27', 'AWOL HALF DAY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.awolHalf).toBe(1);
  });

  test('counts AWOL FULL DAY correctly', () => {
    const rows = [makeRow('2026-05-27', 'AWOL FULL DAY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.awolFull).toBe(1);
  });

  test('ignores ON TIME and other late_status values', () => {
    const rows = [makeRow('2026-05-27', 'ON TIME'), makeRow('2026-05-26', '')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.minor).toBe(0);
    expect(result.major).toBe(0);
    expect(result.awolHalf).toBe(0);
    expect(result.awolFull).toBe(0);
  });
});
