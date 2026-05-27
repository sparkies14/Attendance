const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);

router.get('/all', requireRole('owner', 'admin'), async (req, res) => {
  const { data: members, error: membersErr } = await supabase
    .from('users').select('id, email, name').eq('status', 'Active').neq('role', 'owner');
  if (membersErr) return res.status(500).json({ error: membersErr.message });

  const { data: allRecords, error: recErr } = await supabase
    .from('discipline_records')
    .select('id, user_id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at');
  if (recErr) return res.status(500).json({ error: recErr.message });

  const result = (members || []).map(m => {
    const records = (allRecords || []).filter(r => r.user_id === m.id);
    return {
      email: m.email,
      name: m.name,
      totalWarnings: records.length,
      activeWarnings: records.filter(r => !r.voided).length,
      records,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return res.json({ members: result });
});

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

router.post('/:id/void', requireRole('owner', 'admin'), async (req, res) => {
  const { reason } = req.body || {};
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required.' });

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid record id.' });

  const { data: record, error: fetchErr } = await supabase
    .from('discipline_records').select('id, voided').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (record.voided) return res.status(409).json({ error: 'Warning is already voided.' });

  const { data, error } = await supabase
    .from('discipline_records')
    .update({ voided: true, void_reason: reason.trim(), voided_by: req.user.email, voided_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, user_id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ record: data });
});

router.post('/:id/acknowledge', requireRole('owner', 'admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid record id.' });

  const { data: record, error: fetchErr } = await supabase
    .from('discipline_records').select('id, voided, acknowledged').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (record.voided) return res.status(409).json({ error: 'Cannot acknowledge a voided warning.' });

  const { data, error } = await supabase
    .from('discipline_records')
    .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, user_id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ record: data });
});

module.exports = router;
