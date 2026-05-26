const router = require('express').Router();
const supabase = require('../lib/supabase');

router.post('/', async (req, res) => {
  const { email } = req.body;

  const { data: manager } = await supabase
    .from('managers').select('id').eq('email', email).maybeSingle();
  if (manager) return res.json({ role: 'goldlist' });

  const { data: member } = await supabase
    .from('members').select('id').eq('email', email).maybeSingle();
  if (member) return res.json({ role: 'whitelist' });

  res.json({ role: 'denied' });
});

module.exports = router;
