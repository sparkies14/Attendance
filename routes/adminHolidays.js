const router     = require('express').Router();
const supabase   = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);

router.get('/holidays', requireRole('owner', 'admin'), async (req, res) => {
  let query = supabase.from('holidays').select('*').order('date', { ascending: true });
  if (req.query.country) query = query.eq('country', req.query.country);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ holidays: data || [] });
});

router.post('/holidays', requireRole('owner'), async (req, res) => {
  const { date, name, country } = req.body || {};
  if (!date || !name || !country) {
    return res.status(400).json({ error: 'date, name, and country are required.' });
  }
  const { data, error } = await supabase
    .from('holidays')
    .insert({ date, name, country })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ holiday: data });
});

router.delete('/holidays/:id', requireRole('owner'), async (req, res) => {
  const { error } = await supabase.from('holidays').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

module.exports = router;
