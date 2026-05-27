const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);

const VALID_TYPES = ['discipline', 'leave', 'attendance'];
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;

router.post('/', async (req, res) => {
  const { target_type, target_id, reason } = req.body || {};

  if (!target_type || !VALID_TYPES.includes(target_type)) {
    return res.status(400).json({ error: 'target_type must be one of: discipline, leave, attendance.' });
  }
  if (!target_id) {
    return res.status(400).json({ error: 'target_id is required.' });
  }
  const tid = String(target_id);
  if (target_type === 'attendance' && !DATE_RE.test(tid)) {
    return res.status(400).json({ error: 'target_id must be a valid date in YYYY-MM-DD format for attendance appeals.' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'reason is required.' });
  }
  const trimmedReason = reason.trim();

  if (target_type === 'discipline') {
    const { data: rec, error: recErr } = await supabase
      .from('discipline_records').select('id').eq('id', tid).eq('user_id', req.user.user_id).maybeSingle();
    if (recErr) return res.status(500).json({ error: recErr.message });
    if (!rec) return res.status(404).json({ error: 'Discipline record not found.' });
  }

  if (target_type === 'leave') {
    const { data: rec, error: recErr } = await supabase
      .from('leave_log').select('id').eq('id', tid).eq('email', req.user.email).maybeSingle();
    if (recErr) return res.status(500).json({ error: recErr.message });
    if (!rec) return res.status(404).json({ error: 'Leave record not found.' });
  }

  const { data: existing, error: dupErr } = await supabase
    .from('appeals').select('id').eq('user_id', req.user.user_id).eq('target_type', target_type).eq('target_id', tid).maybeSingle();
  if (dupErr) return res.status(500).json({ error: dupErr.message });
  if (existing) return res.status(409).json({ error: 'Appeal already exists for this record.' });

  const { data, error } = await supabase
    .from('appeals')
    .insert({ user_id: req.user.user_id, target_type, target_id: tid, reason: trimmedReason })
    .select('id, user_id, target_type, target_id, reason, status, resolution_note, resolved_by, resolved_at, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ appeal: data });
});

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('appeals')
    .select('id, target_type, target_id, reason, status, resolution_note, resolved_by, resolved_at, created_at')
    .eq('user_id', req.user.user_id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ appeals: data || [] });
});

module.exports = router;
