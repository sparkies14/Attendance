const router = require('express').Router();
const supabase = require('../lib/supabase');
const { todayJSTISO, BREAK_BUDGET_SECS, LUNCH_BUDGET_SECS } = require('../lib/rules');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);
router.use(requireRole('owner', 'admin'));

router.get('/', async (req, res) => {
  const today = todayJSTISO();

  const [
    { data: todayAtt },
    { data: allUsers },
    { data: pendingAtt },
    { data: pendingLeave },
    { data: breakRows },
    { data: lunchRows },
    { data: approvedLeave },
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('date', today),
    supabase.from('users').select('*').eq('role', 'member').eq('status', 'Active'),
    supabase.from('attendance').select('*').eq('status', 'Pending'),
    supabase.from('leave_log').select('*').eq('status', 'Pending'),
    supabase.from('break_log').select('*').eq('date', today),
    supabase.from('lunch_log').select('*').eq('date', today),
    supabase.from('leave_log').select('*').eq('status', 'Approved').eq('date', today),
  ]);

  const att     = todayAtt || [];
  const members = allUsers || [];
  const breaks  = breakRows || [];
  const lunches = lunchRows || [];
  const leaves  = approvedLeave || [];

  const membersWithStatus = members.map(m => {
    const rec = att.find(a => a.email === m.email);
    let status;
    if (!rec)                                                    status = 'NOT CLOCKED IN';
    else if (rec.status === 'Pending')                           status = 'PENDING APPROVAL';
    else if (rec.clock_out)                                      status = 'CLOCKED OUT';
    else if (rec.late_status && rec.late_status !== 'ON TIME')   status = 'CLOCKED IN (LATE)';
    else                                                         status = 'CLOCKED IN';

    const myBreaks = breaks.filter(b => b.name === m.name);
    const openBreak = myBreaks.find(b => !b.break_in || b.break_in === '');
    const breakUsedSecs = myBreaks
      .filter(b => b.break_in && b.break_in !== '')
      .reduce((sum, b) => sum + (b.duration_secs || 0), 0);

    const myLunches = lunches.filter(l => l.name === m.name);
    const openLunch = myLunches.find(l => !l.lunch_in || l.lunch_in === '');
    const lunchUsedSecs = myLunches
      .filter(l => l.lunch_in && l.lunch_in !== '')
      .reduce((sum, l) => sum + (l.duration_secs || 0), 0);

    const leaveRec = leaves.find(lv => lv.email === m.email);

    return {
      name: m.name,
      email: m.email,
      role: m.job_role,
      status,
      clockIn: rec?.clock_in || '-',
      clockOut: rec?.clock_out || '-',
      totalHours: rec?.total_hours ?? '-',
      lateStatus: rec?.late_status || '',
      emergency: rec?.emergency ?? false,
      emergencyReason: rec?.emergency_reason ?? null,
      onBreak:       !!openBreak,
      breakStart:    openBreak?.break_out || null,
      breakUsedSecs,
      onLunch:       !!openLunch,
      lunchStart:    openLunch?.lunch_out || null,
      lunchUsedSecs,
      onLeave:       !!leaveRec,
      leaveType:     leaveRec?.leave_type || null,
    };
  });

  const isOver = (m) => m.breakUsedSecs > BREAK_BUDGET_SECS || m.lunchUsedSecs > LUNCH_BUDGET_SECS;

  const summary = {
    clockedIn:  membersWithStatus.filter(m => m.status === 'CLOCKED IN' || m.status === 'CLOCKED IN (LATE)').length,
    clockedOut: membersWithStatus.filter(m => m.status === 'CLOCKED OUT').length,
    notIn:      membersWithStatus.filter(m => m.status === 'NOT CLOCKED IN').length,
    pending:    membersWithStatus.filter(m => m.status === 'PENDING APPROVAL').length,
    total:      members.length,
    onBreak:    membersWithStatus.filter(m => m.onBreak).length,
    onLunch:    membersWithStatus.filter(m => m.onLunch).length,
    overBudget: membersWithStatus.filter(isOver).length,
    onLeave:    membersWithStatus.filter(m => m.onLeave).length,
    emergency:  membersWithStatus.filter(m => m.emergency).length,
  };

  res.json({
    date: today,
    budgets: { breakSecs: BREAK_BUDGET_SECS, lunchSecs: LUNCH_BUDGET_SECS },
    summary,
    members: membersWithStatus,
    pendingApprovals: pendingAtt || [],
    pendingLeave: pendingLeave || [],
  });
});

module.exports = router;
