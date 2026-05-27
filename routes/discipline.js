const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);

router.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const { email, reason } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required.' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id').eq('email', email).eq('status', 'Active').neq('role', 'owner').maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Active member not found.' });

  const { data, error } = await supabase
    .from('discipline_records')
    .insert({ user_id: user.id, reason: reason.trim(), issued_by: req.user.email })
    .select('id, user_id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ record: data });
});

router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param required.' });
  const elevated = ['owner', 'admin'].includes(req.user.role);
  if (!elevated && req.user.email !== email) return res.status(403).json({ error: 'Forbidden.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id').eq('email', email).maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Member not found.' });

  const { data, error } = await supabase
    .from('discipline_records')
    .select('id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at')
    .eq('user_id', user.id)
    .order('issued_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ records: data || [] });
});

module.exports = router;
