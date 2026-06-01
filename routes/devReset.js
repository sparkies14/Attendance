// DEV ONLY — Remove this file and the 3-line block in server.js to disable
const router = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.post('/', async (req, res) => {
  const email = req.body.email || req.user.email;

  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const todayISO = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`;

  const { data: user } = await supabase.from('users').select('id, name').eq('email', email).maybeSingle();
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await Promise.all([
    supabase.from('attendance').delete().eq('email', email).eq('date', todayISO),
    supabase.from('lunch_log').delete().eq('name', user.name).eq('date', todayISO),
    supabase.from('break_log').delete().eq('name', user.name).eq('date', todayISO),
    supabase.from('appeals').delete().eq('user_id', user.id).eq('target_type', 'attendance').eq('target_id', todayISO),
  ]);

  res.json({ success: true, date: todayISO, email });
});

module.exports = router;
