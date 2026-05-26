const router = require('express').Router();
const supabase = require('../lib/supabase');
const { calendarDayStatus, todayJST } = require('../lib/rules');

router.get('/', async (req, res) => {
  const { email, month, year } = req.query;
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);
  const today = todayJST();

  if (isNaN(monthNum) || isNaN(yearNum)) {
    return res.status(400).json({ error: 'Invalid month or year.' });
  }

  const { data: member } = await supabase
    .from('members').select('name').eq('email', email).maybeSingle();
  if (!member) return res.status(400).json({ error: 'Member not found.' });
  const officialName = member.name;

  // Fetch all data in parallel
  const [
    { data: allAttendance },
    { data: allLeave },
    { data: lunchToday },
    { data: breakToday }
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('email', email),
    supabase.from('leave_log').select('*').eq('email', email),
    supabase.from('lunch_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
    supabase.from('break_log').select('*').eq('name', officialName).eq('date', today).maybeSingle()
  ]);

  // Filter attendance to requested month/year
  const monthAtt = (allAttendance || []).filter(a => {
    const d = new Date(a.date);
    return d.getMonth() + 1 === monthNum && d.getFullYear() === yearNum;
  });

  // Build calendar array for every day in the month
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const calendar = [];
  const summary = { present: 0, late: 0, absent: 0, pending: 0 };

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(yearNum, monthNum - 1, day);
    const dateStr = d.toLocaleDateString('en-US');
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    // Normalize stored date strings for comparison (handles locale format differences)
    const record = monthAtt.find(
      a => new Date(a.date).toLocaleDateString('en-US') === dateStr
    ) || null;

    const status = calendarDayStatus(record, isWeekend);

    if (!isWeekend) {
      if (status === 'present') summary.present++;
      else if (status === 'late') summary.late++;
      else if (status === 'absent') summary.absent++;
      else if (status === 'pending') summary.pending++;
    }

    calendar.push({
      day,
      date: dateStr,
      status,
      clockIn: record?.clock_in || '-',
      clockOut: record?.clock_out || '-',
      // Only show totalHours once clocked out; show '-' if still clocked in
      totalHours: record?.clock_out ? record.total_hours : '-',
      isWeekend
    });
  }

  const leaveHistory = (allLeave || []).map(l => ({
    date: l.date,
    leaveType: l.leave_type,
    reason: l.reason,
    status: l.status
  }));

  res.json({
    month: monthNum,
    year: yearNum,
    email,
    calendar,
    summary,
    // onLunch: lunch-out recorded AND lunch-in not yet recorded
    onLunch: !!(lunchToday && !lunchToday.lunch_in),
    // onBreak: break-out recorded AND break-in not yet recorded
    onBreak: !!(breakToday && !breakToday.break_in),
    leaveHistory
  });
});

module.exports = router;
