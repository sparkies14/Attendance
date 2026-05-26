const router = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { canPerformRoleAction } = require('../lib/auth');

router.use(requireAuth);

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, job_role, status, created_at, last_login_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ users: data || [] });
});

router.post('/invite', async (req, res) => {
  const { email, name, role } = req.body || {};
  if (!email || !name || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'email, name, and role (admin|member) are required.' });
  }
  if (!canPerformRoleAction(req.user.role, role, 'invite')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) return res.status(409).json({ error: 'A user with this email already exists.' });

  const { data, error } = await supabase.from('users').insert({
    email, name, role, status: 'Pending', created_by: req.user.user_id,
  }).select('id, email, name, role, status').single();
  if (error) return res.status(500).json({ error: error.message });

  try {
    const { sendMessage, CHANNELS } = require('../lib/discord');
    sendMessage(CHANNELS.approvals,
      `📨 Invite sent: **${name}** (${email}) — role: ${role}. They need to register with this email to claim the account.`);
  } catch (e) { /* discord optional */ }

  return res.json({ success: true, user: data });
});

async function performRoleAction(req, res, action, newFields) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Invalid user id.' });
  if (id === req.user.user_id) {
    return res.status(400).json({ error: 'You cannot perform this action on yourself.' });
  }

  const { data: target, error: e1 } = await supabase
    .from('users').select('id, role, status').eq('id', id).maybeSingle();
  if (e1) return res.status(500).json({ error: 'Database error.' });
  if (!target) return res.status(404).json({ error: 'User not found.' });

  if (!canPerformRoleAction(req.user.role, target.role, action)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { data, error } = await supabase.from('users').update(newFields).eq('id', id).select('id, email, name, role, status').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, user: data });
}

router.post('/:id/promote',    (req, res) => performRoleAction(req, res, 'promote',    { role: 'admin' }));
router.post('/:id/demote',     (req, res) => performRoleAction(req, res, 'demote',     { role: 'member' }));
router.post('/:id/activate',   (req, res) => performRoleAction(req, res, 'activate',   { status: 'Active' }));
router.post('/:id/deactivate', (req, res) => performRoleAction(req, res, 'deactivate', { status: 'Inactive' }));

module.exports = router;
