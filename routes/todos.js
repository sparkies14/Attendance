// routes/todos.js
const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  }
  const { data, error } = await supabase
    .from('todos')
    .select('id, text, completed, created_by, created_at')
    .eq('user_id', req.user.user_id)
    .eq('date', date)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ todos: data });
});

router.post('/', async (req, res) => {
  const { date, text } = req.body || {};
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required.' });
  }
  const { data, error } = await supabase
    .from('todos')
    .insert({ user_id: req.user.user_id, date, text: text.trim() })
    .select('id, text, completed, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ todo: data });
});

router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
  const { text, completed } = req.body || {};
  if (text === undefined && completed === undefined) {
    return res.status(400).json({ error: 'text or completed is required.' });
  }
  const { data: existing, error: fetchErr } = await supabase
    .from('todos').select('user_id').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: 'Todo not found.' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  if (!isAdmin && existing.user_id !== req.user.user_id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const updates = { updated_at: new Date().toISOString() };
  if (text !== undefined) updates.text = text.trim();
  if (completed !== undefined) updates.completed = Boolean(completed);
  const { data, error } = await supabase
    .from('todos')
    .update(updates)
    .eq('id', id)
    .select('id, text, completed, created_by, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ todo: data });
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
  const { data: existing, error: fetchErr } = await supabase
    .from('todos').select('user_id').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: 'Todo not found.' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  if (!isAdmin && existing.user_id !== req.user.user_id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const { error } = await supabase.from('todos').eq('id', id).delete();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

module.exports = router;
