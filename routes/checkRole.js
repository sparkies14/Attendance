const router = require('express').Router();
const supabase = require('../lib/supabase');

router.post('/', async (req, res) => {
  const { email } = req.body;

  const { data: manager, error: err1 } = await supabase
    .from('managers').select('id').eq('email', email).maybeSingle();
  if (err1) return res.status(500).json({ error: 'Database error checking managers.' });
  if (manager) return res.json({ role: 'goldlist' });

  const { data: member, error: err2 } = await supabase
    .from('members').select('id').eq('email', email).maybeSingle();
  if (err2) return res.status(500).json({ error: 'Database error checking members.' });
  if (member) return res.json({ role: 'whitelist' });

  res.json({ role: 'denied' });
});

module.exports = router;
