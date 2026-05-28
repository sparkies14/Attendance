// routes/planEvents.js
const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  }
  const { data, error } = await supabase
    .from('plan_events')
    .select('id, title, start_time, end_time, completed, created_by, created_at')
    .eq('user_id', req.user.user_id)
    .eq('date', date)
    .order('start_time', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data });
});

router.post('/', async (req, res) => {
  const { date, title, start_time, end_time } = req.body || {};
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required.' });
  if (!start_time || !TIME_RE.test(start_time)) return res.status(400).json({ error: 'start_time must be HH:MM.' });
  if (!end_time || !TIME_RE.test(end_time)) return res.status(400).json({ error: 'end_time must be HH:MM.' });
  if (end_time <= start_time) return res.status(400).json({ error: 'end_time must be after start_time.' });
  const { data, error } = await supabase
    .from('plan_events')
    .insert({ user_id: req.user.user_id, date, title: title.trim(), start_time, end_time })
    .select('id, title, start_time, end_time, completed, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ event: data });
});

router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
  const { title, start_time, end_time, completed } = req.body || {};
  if (title === undefined && start_time === undefined && end_time === undefined && completed === undefined) {
    return res.status(400).json({ error: 'At least one field required.' });
  }
  const { data: existing, error: fetchErr } = await supabase
    .from('plan_events').select('user_id, start_time, end_time').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: 'Event not found.' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  if (!isAdmin && existing.user_id !== req.user.user_id) return res.status(403).json({ error: 'Forbidden.' });
  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (start_time !== undefined) updates.start_time = start_time;
  if (end_time !== undefined) updates.end_time = end_time;
  if (completed !== undefined) updates.completed = Boolean(completed);
  const resolvedStart = updates.start_time ?? existing.start_time;
  const resolvedEnd   = updates.end_time   ?? existing.end_time;
  if (resolvedEnd <= resolvedStart) return res.status(400).json({ error: 'end_time must be after start_time.' });
  const { data, error } = await supabase
    .from('plan_events')
    .update(updates)
    .eq('id', id)
    .select('id, title, start_time, end_time, completed, created_by, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ event: data });
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
  const { data: existing, error: fetchErr } = await supabase
    .from('plan_events').select('user_id').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: 'Event not found.' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  if (!isAdmin && existing.user_id !== req.user.user_id) return res.status(403).json({ error: 'Forbidden.' });
  const { error } = await supabase.from('plan_events').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

module.exports = router;
