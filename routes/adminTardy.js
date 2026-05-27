const router            = require('express').Router();
const supabase          = require('../lib/supabase');
const requireAuth       = require('../middleware/requireAuth');
const requireRole       = require('../middleware/requireRole');
const { countTardiness }              = require('../lib/tardyCounter');
const { getThresholds, isOverThreshold } = require('../lib/policyConfig');
const { runAwolCheck }                = require('../lib/cron');

router.use(requireAuth);

// Fetch attendance rows from the last 45 calendar days — generous enough
// to always contain 30 working days regardless of holiday density.
function windowStart() {
  const d = new Date();
  d.setDate(d.getDate() - 45);
  return d.toISOString().slice(0, 10);
}

router.get('/tardy-report', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const thresholds = await getThresholds();

    const { data: members, error: membersError } = await supabase
      .from('users')
      .select('id, email, name, country, role, job_role')
      .eq('status', 'Active')
      .neq('role', 'owner');
    if (membersError) return res.status(500).json({ error: membersError.message });

    const { data: allHolidays } = await supabase.from('holidays').select('date, country');
    const start = windowStart();

    const result = [];
    for (const member of members || []) {
      const memberCountry  = member.country || 'PH';
      const memberHolidays = (allHolidays || [])
        .filter(h => h.country === memberCountry)
        .map(h => h.date);

      const { data: attendance } = await supabase
        .from('attendance')
        .select('date, late_status')
        .eq('email', member.email)
        .gte('date', start);

      const counts = countTardiness(attendance || [], memberHolidays);
      const { exceeded, reasons } = isOverThreshold(counts, thresholds);

      result.push({
        id: member.id, name: member.name, email: member.email, country: memberCountry,
        counts: { minor: counts.minor, major: counts.major, awolHalf: counts.awolHalf, awolFull: counts.awolFull },
        exceeded, reasons,
      });
    }

    result.sort((a, b) => (b.exceeded ? 1 : 0) - (a.exceeded ? 1 : 0) || a.name.localeCompare(b.name));
    return res.json({ thresholds, members: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/tardy-summary', async (req, res) => {
  try {
    const thresholds = await getThresholds();

    const { data: member, error: memberError } = await supabase
      .from('users')
      .select('id, email, name, country')
      .eq('id', req.user.user_id)
      .single();
    if (memberError) return res.status(500).json({ error: memberError.message });

    const memberCountry  = member.country || 'PH';
    const { data: allHolidays } = await supabase.from('holidays').select('date, country');
    const memberHolidays = (allHolidays || [])
      .filter(h => h.country === memberCountry)
      .map(h => h.date);

    const { data: attendance } = await supabase
      .from('attendance')
      .select('date, late_status')
      .eq('email', member.email)
      .gte('date', windowStart());

    const counts = countTardiness(attendance || [], memberHolidays);
    const { exceeded, reasons } = isOverThreshold(counts, thresholds);

    return res.json({
      id: member.id, name: member.name, email: member.email, country: memberCountry,
      counts: { minor: counts.minor, major: counts.major, awolHalf: counts.awolHalf, awolFull: counts.awolFull },
      exceeded, reasons,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/run-awol-check', requireRole('owner', 'admin'), async (req, res) => {
  const { date } = req.body || {};
  const result = await runAwolCheck(date || null);
  return res.json(result);
});

module.exports = router;
