function classifyLateStatus(jstHour, jstMinute) {
  if (jstHour < 9 || (jstHour === 9 && jstMinute <= 10)) return 'ON TIME';
  if (jstHour === 9 && jstMinute <= 30) return 'MINOR TARDY';
  if (jstHour < 11 || (jstHour === 11 && jstMinute === 0)) return 'MAJOR TARDY';
  return 'AWOL HALF DAY';
}

function timeToMinutes(timeStr) {
  const isPM = /pm/i.test(timeStr);
  const isAM = /am/i.test(timeStr);
  const parts = timeStr.replace(/[apm\s]/gi, '').split(':').map(Number);
  const [h, m] = parts;
  let hours = h;
  if (isPM && hours !== 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + m;
}

function calcNetHours(clockInStr, clockOutStr) {
  const diff = (timeToMinutes(clockOutStr) - timeToMinutes(clockInStr)) / 60 - 1;
  return Math.max(0, Math.round(diff * 100) / 100);
}

function calcRawHours(fromStr, toStr) {
  return Math.max(0, (timeToMinutes(toStr) - timeToMinutes(fromStr)) / 60);
}

function calendarDayStatus(record, isWeekend) {
  if (isWeekend) return 'weekend';
  if (!record) return 'absent';
  if (record.status === 'Pending') return 'pending';
  if (record.status === 'leave') return 'leave';
  const isLate = record.late_status && record.late_status !== '' && record.late_status !== 'ON TIME';
  return isLate ? 'late' : 'present';
}

function todayJST() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo' });
}

module.exports = { classifyLateStatus, timeToMinutes, calcNetHours, calcRawHours, calendarDayStatus, todayJST };
