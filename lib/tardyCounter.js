function buildWorkingDaySet(referenceDate, windowDays, holidays) {
  const holidaySet = new Set(holidays);
  const workingDays = [];
  const cursor = new Date(referenceDate);

  while (workingDays.length < windowDays) {
    const day = cursor.getDay(); // 0=Sun, 6=Sat
    const dateStr = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
      workingDays.unshift(dateStr);
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return new Set(workingDays);
}

function countTardiness(attendanceRows, holidays, windowDays = 30, referenceDate = new Date()) {
  const workingDaySet = buildWorkingDaySet(referenceDate, windowDays, holidays);
  let minor = 0, major = 0, awolHalf = 0, awolFull = 0;

  for (const row of attendanceRows) {
    if (!workingDaySet.has(row.date)) continue;
    if      (row.late_status === 'MINOR TARDY')    minor++;
    else if (row.late_status === 'MAJOR TARDY')    major++;
    else if (row.late_status === 'AWOL HALF DAY')  awolHalf++;
    else if (row.late_status === 'AWOL FULL DAY')  awolFull++;
  }

  return { minor, major, awolHalf, awolFull, workingDaysInWindow: workingDaySet.size };
}

module.exports = { countTardiness };
