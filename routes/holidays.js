const router = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/mine', async (req, res) => {
  let year = parseInt(req.query.year, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    year = new Date().getFullYear();
  }
  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('country')
    .eq('id', req.user.user_id)
    .maybeSingle();
  if (uErr) return res.status(500).json({ error: uErr.message });

  const country = user && user.country ? user.country : null;
  if (!country) return res.json({ country: null, holidays: [] });

  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .eq('country', country)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ country, holidays: data || [] });
});

module.exports = router;
