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
  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

router.get('/admin', requireRole('owner', 'admin'), async (req, res) => {
  const { user_id, date } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  const { data, error } = await supabase
    .from('todos')
    .select('id, text, completed, created_by, created_at')
    .eq('user_id', user_id)
    .eq('date', date)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ todos: data });
});

router.post('/admin', requireRole('owner', 'admin'), async (req, res) => {
  const { user_id, date, text } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required.' });
  const { data, error } = await supabase
    .from('todos')
    .insert({ user_id, date, text: text.trim(), created_by: req.user.email })
    .select('id, text, completed, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ todo: data });
});

router.get('/admin/week', requireRole('owner', 'admin'), async (req, res) => {
  const { week_start } = req.query;
  if (!week_start || !DATE_RE.test(week_start)) {
    return res.status(400).json({ error: 'week_start must be YYYY-MM-DD.' });
  }
  const end = new Date(week_start);
  end.setDate(end.getDate() + 5);
  const endStr = end.toISOString().slice(0, 10);
  const [{ data: members, error: mErr }, { data: todos, error: tErr }] = await Promise.all([
    supabase.from('users').select('id, name, email').eq('status', 'Active').order('name'),
    supabase.from('todos')
      .select('id, user_id, date, text, completed, created_by')
      .gte('date', week_start)
      .lte('date', endStr)
      .order('created_at', { ascending: true }),
  ]);
  if (mErr) return res.status(500).json({ error: mErr.message });
  if (tErr) return res.status(500).json({ error: tErr.message });
  return res.json({ members: members || [], todos: todos || [] });
});

router.get('/admin/month', requireRole('owner', 'admin'), async (req, res) => {
  const { user_id, month, year } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  const m = parseInt(month), y = parseInt(year);
  if (isNaN(m) || isNaN(y)) return res.status(400).json({ error: 'month and year must be numbers.' });
  const mm = String(m).padStart(2, '0');
  const startDate = `${y}-${mm}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('todos').select('date')
    .eq('user_id', user_id)
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) return res.status(500).json({ error: error.message });
  const counts = {};
  for (const row of (data || [])) {
    counts[row.date] = (counts[row.date] || 0) + 1;
  }
  return res.json({ todosByDate: counts });
});

module.exports = router;
