const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { computeBalance } = require('../lib/leaveBalance');

router.use(requireAuth);

const currentYear = () => new Date().getFullYear();

router.get('/all', requireRole('owner', 'admin'), async (req, res) => {
  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, email, name, created_at')
    .eq('status', 'Active')
    .neq('role', 'owner');
  if (membersErr) return res.status(500).json({ error: membersErr.message });

  const { data: allLeaves, error: leavesErr } = await supabase
    .from('leave_log')
    .select('email')
    .eq('status', 'Approved');
  if (leavesErr) return res.status(500).json({ error: leavesErr.message });

  const { data: allAdj, error: adjErr } = await supabase
    .from('leave_adjustments')
    .select('user_id, amount');
  if (adjErr) return res.status(500).json({ error: adjErr.message });

  const year = currentYear();
  const result = (members || []).map(m => {
    const hireYear = new Date(m.created_at).getFullYear();
    const used = (allLeaves || []).filter(l => l.email === m.email).length;
    const adjustments = (allAdj || [])
      .filter(a => a.user_id === m.id)
      .reduce((s, a) => s + a.amount, 0);
    return {
      email: m.email,
      name: m.name,
      hire_year: hireYear,
      ...computeBalance({ hireYear, currentYear: year, used, adjustments }),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return res.json({ members: result });
});

router.get('/adjustments', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param required.' });
  const elevated = ['owner', 'admin'].includes(req.user.role);
  if (!elevated && req.user.email !== email) return res.status(403).json({ error: 'Forbidden.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id').eq('email', email).maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Member not found.' });

  const { data, error } = await supabase
    .from('leave_adjustments')
    .select('id, amount, note, created_by, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ adjustments: data || [] });
});

router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param required.' });
  const elevated = ['owner', 'admin'].includes(req.user.role);
  if (!elevated && req.user.email !== email) return res.status(403).json({ error: 'Forbidden.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id, name, created_at').eq('email', email).maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Member not found.' });

  const [{ data: leaves, error: leavesErr }, { data: adjs, error: adjErr }] = await Promise.all([
    supabase.from('leave_log').select('id').eq('email', email).eq('status', 'Approved'),
    supabase.from('leave_adjustments').select('amount').eq('user_id', user.id),
  ]);
  if (leavesErr) return res.status(500).json({ error: leavesErr.message });
  if (adjErr) return res.status(500).json({ error: adjErr.message });

  const hireYear = new Date(user.created_at).getFullYear();
  const year = currentYear();
  const used = (leaves || []).length;
  const adjustments = (adjs || []).reduce((s, a) => s + a.amount, 0);

  return res.json({
    email,
    name: user.name,
    hire_year: hireYear,
    ...computeBalance({ hireYear, currentYear: year, used, adjustments }),
  });
});

router.post('/adjust', requireRole('owner', 'admin'), async (req, res) => {
  const { email, amount, note } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required.' });
  const amt = parseInt(amount, 10);
  if (!Number.isInteger(amt) || amt === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero integer.' });
  }
  if (!note || !note.trim()) return res.status(400).json({ error: 'note is required.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id').eq('email', email).eq('status', 'Active').maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Active member not found.' });

  const { data, error } = await supabase
    .from('leave_adjustments')
    .insert({ user_id: user.id, amount: amt, note: note.trim(), created_by: req.user.email })
    .select('id, user_id, amount, note, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ adjustment: data });
});

module.exports = router;
