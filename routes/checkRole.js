const router = require('express').Router();
const supabase = require('../lib/supabase');

// LEGACY: returns 'goldlist' for owner/admin, 'whitelist' for member, 'denied' otherwise.
// Kept for backward compatibility during Milestone A; removed in Milestone B.
router.post('/', async (req, res) => {
  const { email } = req.body || {};
  const { data: user, error } = await supabase
    .from('users').select('role, status').eq('email', email).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });
  if (!user || user.status !== 'Active') return res.json({ role: 'denied' });

  if (user.role === 'owner' || user.role === 'admin') return res.json({ role: 'goldlist' });
  if (user.role === 'member') return res.json({ role: 'whitelist' });
  return res.json({ role: 'denied' });
});

module.exports = router;
