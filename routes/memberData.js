const router = require('express').Router();
const supabase = require('../lib/supabase');
const { calendarDayStatus, todayJSTISO, BREAK_BUDGET_SECS, LUNCH_BUDGET_SECS } = require('../lib/rules');
const requireAuth = require('../middleware/requireAuth');
const requireSelfOrRole = require('../middleware/requireSelfOrRole');

router.use(requireAuth);
router.use(requireSelfOrRole('email', 'owner', 'admin'));

router.get('/', async (req, res) => {
  const { email, month, year } = req.query;
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);
  // break_log/lunch_log rows are written with the client's JST ISO date (YYYY-MM-DD),
  // so we must query them with the same format — not todayJST()'s "M/D/YYYY".
  const today = todayJSTISO();

  if (isNaN(monthNum) || isNaN(yearNum)) {
    return res.status(400).json({ error: 'Invalid month or year.' });
  }

  const { data: user } = await supabase
    .from('users').select('name, id').eq('email', email).maybeSingle();
  if (!user) return res.status(400).json({ error: 'Member not found.' });
  const officialName = user.name;
  const userId = user.id;

  const [
    { data: allAttendance },
    { data: allLeave },
    { data: lunchRows },
    { data: breakRows },
    { data: monthPlanEvents },
    { data: latePolicy },
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('email', email),
    supabase.from('leave_log').select('*').eq('email', email),
    supabase.from('lunch_log').select('*').eq('name', officialName).eq('date', today),
    supabase.from('break_log').select('*').eq('name', officialName).eq('date', today),
    supabase.from('plan_events').select('date').eq('user_id', userId)
      .gte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-01`)
      .lte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-${String(new Date(yearNum, monthNum, 0).getDate()).padStart(2,'0')}`),
    supabase.from('policy_config').select('value').eq('key', 'late_manual_required').maybeSingle(),
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

    const isoDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendar.push({
      day,
      date: dateStr,
      status,
      clockIn: record?.clock_in || '-',
      clockOut: record?.clock_out || '-',
      totalHours: record?.clock_out ? record.total_hours : '-',
      lastClockIn: record?.last_clock_in || record?.clock_in || '-',
      accumulatedHours: record?.accumulated_hours || 0,
      entryType: record?.entry_type || 'auto',
      dateISO: isoDate,
      isWeekend,
    });
  }

  const leaveHistory = (allLeave || []).map(l => {
    // Normalize YYYY-MM-DD → M/D/YYYY so the frontend date helpers always work
    let date = l.date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, d] = date.split('-').map(Number);
      date = `${m}/${d}/${y}`;
    }
    return { id: l.id, date, leaveType: l.leave_type, reason: l.reason, status: l.status };
  });

  const planEventsByDate = {};
  for (const row of (monthPlanEvents || [])) {
    const d = String(row.date).slice(0, 10);
    planEventsByDate[d] = (planEventsByDate[d] || 0) + 1;
  }

  const breaks = breakRows || [];
  const openBreak = breaks.find(b => !b.break_in || b.break_in === '');
  const breakUsedSecs = breaks
    .filter(b => b.break_in && b.break_in !== '')
    .reduce((sum, b) => sum + (b.duration_secs || 0), 0);

  const lunches = lunchRows || [];
  const openLunch = lunches.find(l => !l.lunch_in || l.lunch_in === '');
  const lunchUsedSecs = lunches
    .filter(l => l.lunch_in && l.lunch_in !== '')
    .reduce((sum, l) => sum + (l.duration_secs || 0), 0);
  const lunchConsumed = lunches.some(l => l.lunch_in && l.lunch_in !== '');

  const lateManualRequired = (latePolicy?.value ?? 'on') === 'on';

  res.json({
    month: monthNum,
    year: yearNum,
    email,
    calendar,
    summary,
    planEventsByDate,
    onLunch:    !!openLunch,
    onBreak:    !!openBreak,
    hadLunch:   lunchConsumed,
    lunchStart: openLunch?.lunch_out || null,
    lunchEnd:   null,
    breakStart: openBreak?.break_out || null,
    breakEnd:   null,
    // budgeted-timer fields
    breakBudgetSecs: BREAK_BUDGET_SECS,
    breakUsedSecs,
    lunchBudgetSecs: LUNCH_BUDGET_SECS,
    lunchUsedSecs,
    lunchConsumed,
    lateManualRequired,
    leaveHistory,
  });
});

module.exports = router;
