const router = require('express').Router();
const supabase = require('../lib/supabase');
const { calendarDayStatus, todayJST } = require('../lib/rules');
const requireAuth = require('../middleware/requireAuth');
const requireSelfOrRole = require('../middleware/requireSelfOrRole');

router.use(requireAuth);
router.use(requireSelfOrRole('email', 'owner', 'admin'));

router.get('/', async (req, res) => {
  const { email, month, year } = req.query;
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);
  const today = todayJST();

  if (isNaN(monthNum) || isNaN(yearNum)) {
    return res.status(400).json({ error: 'Invalid month or year.' });
  }

  const { data: user } = await supabase
    .from('users').select('name').eq('email', email).maybeSingle();
  if (!user) return res.status(400).json({ error: 'Member not found.' });
  const officialName = user.name;

  const [
    { data: allAttendance },
    { data: allLeave },
    { data: lunchToday },
    { data: breakToday },
    { data: monthTodos },
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('email', email),
    supabase.from('leave_log').select('*').eq('email', email),
    supabase.from('lunch_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
    supabase.from('break_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
    supabase.from('todos').select('date').eq('user_id', req.user.user_id)
      .gte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-01`)
      .lte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-${String(new Date(yearNum, monthNum, 0).getDate()).padStart(2,'0')}`),
  ]);

  const monthAtt = (allAttendance || []).filter(a => {
    const d = new Date(a.date);
    return d.getMonth() + 1 === monthNum && d.getFullYear() === yearNum;
  });

  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const calendar = [];
  const summary = { present: 0, late: 0, absent: 0, pending: 0 };

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(yearNum, monthNum - 1, day);
    const dateStr = d.toLocaleDateString('en-US');
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

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
      totalHours: record?.clock_out ? record.total_hours : '-',
      isWeekend,
    });
  }

  const leaveHistory = (allLeave || []).map(l => ({
    id: l.id,
    date: l.date,
    leaveType: l.leave_type,
    reason: l.reason,
    status: l.status,
  }));

  const todosByDate = {};
  for (const row of (monthTodos || [])) {
    const d = String(row.date).slice(0, 10);
    todosByDate[d] = (todosByDate[d] || 0) + 1;
  }

  res.json({
    month: monthNum,
    year: yearNum,
    email,
    calendar,
    summary,
    todosByDate,
    onLunch: !!(lunchToday && !lunchToday.lunch_in),
    onBreak: !!(breakToday && !breakToday.break_in),
    hadLunch: !!(lunchToday),
    leaveHistory,
  });
});

module.exports = router;
