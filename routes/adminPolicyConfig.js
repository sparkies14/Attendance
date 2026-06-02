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
const TOGGLE_KEY = 'late_manual_required';

function buildPayload(rows) {
  const config = {};
  let lateManualRequired = true; // safe default when the row is absent (migration 022 not yet run): keep manual-approval ON
  for (const row of rows || []) {
    if (row.key === TOGGLE_KEY) lateManualRequired = row.value === 'on';
    else config[row.key] = parseInt(row.value, 10);
  }
  return { config, lateManualRequired };
}

router.use(requireAuth);

router.get('/policy-config', requireRole('owner', 'admin'), async (req, res) => {
  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(buildPayload(data));
});

// Toggle is editable by owner + admin; numeric thresholds remain owner-only.
router.patch('/policy-config', requireRole('owner', 'admin'), async (req, res) => {
  const updates = req.body || {};
  const isOwner = req.user.role === 'owner';

  for (const [key, value] of Object.entries(updates)) {
    if (key === TOGGLE_KEY) {
      if (value !== 'on' && value !== 'off') {
        return res.status(400).json({ error: `${TOGGLE_KEY} must be 'on' or 'off'.` });
      }
      continue;
    }
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: `Unknown config key: ${key}` });
    }
    if (!isOwner) {
      return res.status(403).json({ error: 'Only the owner can change tardy thresholds.' });
    }
    const num = parseInt(value, 10);
    if (!Number.isInteger(num) || num < 1) {
      return res.status(400).json({ error: `${key} must be a positive integer.` });
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (key === TOGGLE_KEY) {
      const { error } = await supabase.from('policy_config').upsert({ key, value });
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabase.from('policy_config')
        .update({ value: String(parseInt(value, 10)) }).eq('key', key);
      if (error) return res.status(500).json({ error: error.message });
    }
  }

  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(buildPayload(data));
});

module.exports = router;
