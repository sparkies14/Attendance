const router = require('express').Router();
const supabase = require('../lib/supabase');
const { hashPassword, verifyPassword, signToken } = require('../lib/auth');
const requireAuth = require('../middleware/requireAuth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(e) { return typeof e === 'string' && EMAIL_RE.test(e); }
function validatePassword(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 128; }
function validateName(n) { return typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 80; }

async function verifyGoogleCredential(credential) {
  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.sub || !data.email) return null;
  return { sub: data.sub, email: data.email, name: data.name || data.email };
}

function issueLoginResponse(user) {
  const token = signToken({ user_id: user.id, email: user.email, role: user.role });
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

// ── Public ──────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!validateEmail(email))    return res.status(400).json({ error: 'Invalid email.' });
  if (!validateName(name))      return res.status(400).json({ error: 'Name must be 1–80 characters.' });
  if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be 8–128 characters.' });

  const { data: existing, error: e1 } = await supabase
    .from('users').select('id, password_hash, role, status, name').eq('email', email).maybeSingle();
  if (e1) return res.status(500).json({ error: 'Database error.' });

  const password_hash = await hashPassword(password);

  if (!existing) {
    const { error } = await supabase.from('users').insert({
      email, name: name.trim(), password_hash, role: 'member', status: 'Pending',
    });
    if (error) return res.status(500).json({ error: error.message });

    try {
      const { sendMessage, CHANNELS } = require('../lib/discord');
      sendMessage(CHANNELS.approvals,
        `🆕 New signup: **${name}** (${email}). Approve in the admin panel.`);
    } catch (e) { /* discord optional */ }

    return res.json({ success: true, message: 'Account created. Waiting for admin approval.' });
  }

  if (existing.password_hash) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const { error: e2 } = await supabase.from('users')
    .update({ password_hash })
    .eq('id', existing.id);
  if (e2) return res.status(500).json({ error: e2.message });

  return res.json({ success: true, message: 'Account ready. Waiting for admin approval.' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || typeof password !== 'string') {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const { data: user, error } = await supabase
    .from('users').select('id, email, name, role, status, password_hash').eq('email', email).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  if (user.status === 'Pending')  return res.status(403).json({ error: 'Your account is awaiting approval.' });
  if (user.status === 'Inactive') return res.status(403).json({ error: 'Your account has been deactivated.' });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  return res.json(issueLoginResponse(user));
});

router.post('/google', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing credential.' });

  const profile = await verifyGoogleCredential(credential);
  if (!profile) return res.status(401).json({ error: 'Invalid Google credential.' });

  let { data: user } = await supabase
    .from('users').select('id, email, name, role, status, google_sub').eq('google_sub', profile.sub).maybeSingle();
  if (!user) {
    const r = await supabase.from('users')
      .select('id, email, name, role, status, google_sub').eq('email', profile.email).maybeSingle();
    user = r.data;
  }

  if (!user) {
    return res.status(403).json({ error: 'No account found. Please register first.' });
  }
  if (user.status === 'Pending')  return res.status(403).json({ error: 'Your account is awaiting approval.' });
  if (user.status === 'Inactive') return res.status(403).json({ error: 'Your account has been deactivated.' });

  if (!user.google_sub) {
    await supabase.from('users').update({ google_sub: profile.sub }).eq('id', user.id);
  }
  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  return res.json(issueLoginResponse(user));
});

// ── Authenticated ───────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users').select('id, email, name, role, status, google_sub, password_hash').eq('id', req.user.user_id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({
    id: user.id, email: user.email, name: user.name, role: user.role, status: user.status,
    hasPassword: !!user.password_hash,
    hasGoogle: !!user.google_sub,
  });
});

router.post('/link-google', requireAuth, async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing credential.' });

  const profile = await verifyGoogleCredential(credential);
  if (!profile) return res.status(401).json({ error: 'Invalid Google credential.' });

  if (profile.email !== req.user.email) {
    return res.status(400).json({ error: 'Google account email does not match your account.' });
  }

  const { error } = await supabase.from('users')
    .update({ google_sub: profile.sub })
    .eq('id', req.user.user_id);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ success: true, message: 'Google account linked.' });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!validatePassword(new_password)) {
    return res.status(400).json({ error: 'New password must be 8–128 characters.' });
  }

  const { data: user, error } = await supabase
    .from('users').select('password_hash').eq('id', req.user.user_id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (user.password_hash) {
    const ok = await verifyPassword(current_password || '', user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const new_hash = await hashPassword(new_password);
  const { error: e2 } = await supabase.from('users').update({ password_hash: new_hash }).eq('id', req.user.user_id);
  if (e2) return res.status(500).json({ error: e2.message });

  return res.json({ success: true, message: 'Password updated.' });
});

module.exports = router;
