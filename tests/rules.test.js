const { classifyLateStatus, timeToMinutes, calcNetHours, calendarDayStatus } = require('../lib/rules');

describe('classifyLateStatus', () => {
  test('before 9:00 → ON TIME', () => expect(classifyLateStatus(8, 59)).toBe('ON TIME'));
  test('exactly 9:00 → ON TIME', () => expect(classifyLateStatus(9, 0)).toBe('ON TIME'));
  test('9:10 → ON TIME', () => expect(classifyLateStatus(9, 10)).toBe('ON TIME'));
  test('9:11 → MINOR TARDY', () => expect(classifyLateStatus(9, 11)).toBe('MINOR TARDY'));
  test('9:30 → MINOR TARDY', () => expect(classifyLateStatus(9, 30)).toBe('MINOR TARDY'));
  test('9:31 → MAJOR TARDY', () => expect(classifyLateStatus(9, 31)).toBe('MAJOR TARDY'));
  test('11:00 → MAJOR TARDY', () => expect(classifyLateStatus(11, 0)).toBe('MAJOR TARDY'));
  test('11:01 → AWOL HALF DAY', () => expect(classifyLateStatus(11, 1)).toBe('AWOL HALF DAY'));
  test('13:00 → AWOL HALF DAY', () => expect(classifyLateStatus(13, 0)).toBe('AWOL HALF DAY'));
});

describe('timeToMinutes', () => {
  test('09:00 → 540', () => expect(timeToMinutes('09:00')).toBe(540));
  test('18:30 → 1110', () => expect(timeToMinutes('18:30')).toBe(1110));
  test('00:00 → 0', () => expect(timeToMinutes('00:00')).toBe(0));
});

describe('calcNetHours', () => {
  test('09:00 to 18:00 → 8h (minus 1h unpaid lunch)', () => expect(calcNetHours('09:00', '18:00')).toBe(8));
  test('09:00 to 09:30 → 0 (never goes negative)', () => expect(calcNetHours('09:00', '09:30')).toBe(0));
  test('09:00 to 17:30 → 7.5h', () => expect(calcNetHours('09:00', '17:30')).toBe(7.5));
  test('09:15 to 18:15 → 8h', () => expect(calcNetHours('09:15', '18:15')).toBe(8));
  test('09:00 to 10:00 → 0 (exactly 1h work, minus 1h = 0)', () => expect(calcNetHours('09:00', '10:00')).toBe(0));
});

describe('calendarDayStatus', () => {
  test('weekend with no record → weekend', () =>
    expect(calendarDayStatus(null, true)).toBe('weekend'));
  test('weekend with a record → weekend (takes priority)', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '18:00', late_status: 'ON TIME' }, true)).toBe('weekend'));
  test('no record on weekday → absent', () =>
    expect(calendarDayStatus(null, false)).toBe('absent'));
  test('status=Pending → pending', () =>
    expect(calendarDayStatus({ status: 'Pending', clock_out: null, late_status: '' }, false)).toBe('pending'));
  test('has clock_out value → clocked-out', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '18:00', late_status: 'ON TIME' }, false)).toBe('clocked-out'));
  test('clock_out is empty string → present (not clocked-out)', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'ON TIME' }, false)).toBe('present'));
  test('approved, no clock_out, MINOR TARDY → late', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'MINOR TARDY' }, false)).toBe('late'));
  test('approved, no clock_out, MAJOR TARDY → late', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'MAJOR TARDY' }, false)).toBe('late'));
  test('approved, no clock_out, AWOL HALF DAY → late', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'AWOL HALF DAY' }, false)).toBe('late'));
});
