const router = require('express').Router();
const supabase = require('../lib/supabase');
const { todayJST } = require('../lib/rules');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);
router.use(requireRole('owner', 'admin'));

router.get('/', async (req, res) => {
  const today = todayJST();

  const [
    { data: todayAtt },
    { data: allUsers },
    { data: pendingAtt },
    { data: pendingLeave },
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('date', today),
    supabase.from('users').select('*').eq('role', 'member').eq('status', 'Active'),
    supabase.from('attendance').select('*').eq('status', 'Pending'),
    supabase.from('leave_log').select('*').eq('status', 'Pending'),
  ]);

  const att = todayAtt || [];
  const members = allUsers || [];

  const membersWithStatus = members.map(m => {
    const rec = att.find(a => a.email === m.email);
    let status;
    if (!rec)                                                    status = 'NOT CLOCKED IN';
    else if (rec.status === 'Pending')                           status = 'PENDING APPROVAL';
    else if (rec.clock_out)                                      status = 'CLOCKED OUT';
    else if (rec.late_status && rec.late_status !== 'ON TIME')   status = 'CLOCKED IN (LATE)';
    else                                                         status = 'CLOCKED IN';

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
    };
  });

  const summary = {
    clockedIn:  membersWithStatus.filter(m => m.status === 'CLOCKED IN' || m.status === 'CLOCKED IN (LATE)').length,
    clockedOut: membersWithStatus.filter(m => m.status === 'CLOCKED OUT').length,
    notIn:      membersWithStatus.filter(m => m.status === 'NOT CLOCKED IN').length,
    pending:    membersWithStatus.filter(m => m.status === 'PENDING APPROVAL').length,
    total:      members.length,
  };

  res.json({
    date: today,
    summary,
    members: membersWithStatus,
    pendingApprovals: pendingAtt || [],
    pendingLeave: pendingLeave || [],
  });
});

module.exports = router;
