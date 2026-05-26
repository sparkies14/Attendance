function classifyLateStatus(jstHour, jstMinute) {
  if (jstHour < 9 || (jstHour === 9 && jstMinute <= 10)) return 'ON TIME';
  if (jstHour === 9 && jstMinute <= 30) return 'MINOR TARDY';
  if (jstHour < 11 || (jstHour === 11 && jstMinute === 0)) return 'MAJOR TARDY';
  return 'AWOL HALF DAY';
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function calcNetHours(clockInStr, clockOutStr) {
  const diff = (timeToMinutes(clockOutStr) - timeToMinutes(clockInStr)) / 60 - 1;
  return Math.max(0, Math.round(diff * 100) / 100);
}

function calendarDayStatus(record, isWeekend) {
  if (isWeekend) return 'weekend';
  if (!record) return 'absent';
  if (record.status === 'Pending') return 'pending';
  if (record.clock_out) return 'clocked-out';
  if (record.late_status === 'ON TIME') return 'present';
  return 'late';
}

function todayJST() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo' });
}

module.exports = { classifyLateStatus, timeToMinutes, calcNetHours, calendarDayStatus, todayJST };
