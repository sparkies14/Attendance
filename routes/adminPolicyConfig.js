const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const ALLOWED_KEYS = [
  'threshold_minor_tardy',
  'threshold_major_tardy',
  'threshold_awol_half',
  'threshold_awol_full',
];

router.use(requireAuth);

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  const config = {};
  for (const row of data || []) config[row.key] = parseInt(row.value, 10);
  return res.json({ config });
});

router.patch('/', requireRole('owner'), async (req, res) => {
  const updates = req.body || {};
  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: `Unknown config key: ${key}` });
    }
    const num = parseInt(value, 10);
    if (!Number.isInteger(num) || num < 1) {
      return res.status(400).json({ error: `${key} must be a positive integer.` });
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    const { error } = await supabase
      .from('policy_config')
      .update({ value: String(parseInt(value, 10)) })
      .eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
  }
  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  const config = {};
  for (const row of data || []) config[row.key] = parseInt(row.value, 10);
  return res.json({ config });
});

module.exports = router;
