const router     = require('express').Router();
const supabase   = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { isSupportedCountry } = require('../lib/holidays');
const { fetchHolidays } = require('../lib/calendarific');

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

router.post('/holidays/sync', requireRole('owner'), async (req, res) => {
  const { country, year } = req.body || {};
  const y = parseInt(year, 10);

  if (!isSupportedCountry(country)) {
    return res.status(400).json({ error: 'Unsupported country.' });
  }
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return res.status(400).json({ error: 'Invalid year.' });
  }
  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Holiday API key not configured.' });
  }
  let holidays;
  try {
    holidays = await fetchHolidays(country, y, apiKey);
  } catch (err) {
    return res.status(502).json({ error: `Holiday provider error: ${err.message}` });
  }
  const del = await supabase.from('holidays').delete()
    .eq('country', country)
    .eq('source', 'auto')
    .gte('date', `${y}-01-01`)
    .lte('date', `${y}-12-31`);
  if (del.error) return res.status(500).json({ error: del.error.message });

  if (holidays.length) {
    const rows = holidays.map(h => ({ date: h.date, name: h.name, country, source: 'auto' }));
    const ins = await supabase.from('holidays').upsert(rows, { onConflict: 'date,country', ignoreDuplicates: true });
    if (ins.error) return res.status(500).json({ error: ins.error.message });
  }
  return res.json({ imported: holidays.length });
});

module.exports = router;
