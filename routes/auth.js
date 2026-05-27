const router = require('express').Router();
const supabase = require('../lib/supabase');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../lib/auth');
const requireAuth = require('../middleware/requireAuth');
const audit = require('../lib/audit');

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
  const token = signToken({ user_id: user.id, email: user.email, role: user.role, name: user.name });
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

function setAuthCookie(res, token) {
  res.cookie('att_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
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
    const { data: inserted, error } = await supabase.from('users').insert({
      email, name: name.trim(), password_hash, role: 'member', status: 'Pending',
    }).select('id').single();
    if (error) return res.status(500).json({ error: error.message });

    await audit.log(req, audit.ACTIONS.REGISTER, {
      actor: { user_id: inserted.id, email, role: 'member' },
      target_user_id: inserted.id,
      target_table: 'users',
      target_id: inserted.id,
      details: { path: 'fresh_signup' },
    });

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

  await audit.log(req, audit.ACTIONS.REGISTER, {
    actor: { user_id: existing.id, email, role: existing.role },
    target_user_id: existing.id,
    target_table: 'users',
    target_id: existing.id,
    details: { path: 'invite_claim' },
  });

  return res.json({ success: true, message: 'Account ready. Waiting for admin approval.' });
});

router.post('/set-cookie', (req, res) => {
  const { token } = req.body || {};
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token.' });
  setAuthCookie(res, token);
  return res.json({ success: true });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || typeof password !== 'string') {
    await audit.log(req, audit.ACTIONS.LOGIN_FAILED, {
      actor: { user_id: null, email: typeof email === 'string' ? email : null, role: null },
      details: { reason: 'invalid_input' },
    });
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const { data: user, error } = await supabase
    .from('users').select('id, email, name, role, status, password_hash').eq('email', email).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });

  if (!user) {
    await audit.log(req, audit.ACTIONS.LOGIN_FAILED, {
      actor: { user_id: null, email, role: null },
      details: { reason: 'no_such_user' },
    });
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (user.status === 'Pending') {
    await audit.log(req, audit.ACTIONS.LOGIN_FAILED, {
      actor: { user_id: user.id, email, role: user.role },
      target_user_id: user.id, target_table: 'users', target_id: user.id,
      details: { reason: 'pending' },
    });
    return res.status(403).json({ error: 'Your account is awaiting approval.' });
  }
  if (user.status === 'Inactive') {
    await audit.log(req, audit.ACTIONS.LOGIN_FAILED, {
      actor: { user_id: user.id, email, role: user.role },
      target_user_id: user.id, target_table: 'users', target_id: user.id,
      details: { reason: 'inactive' },
    });
    return res.status(403).json({ error: 'Your account has been deactivated.' });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    await audit.log(req, audit.ACTIONS.LOGIN_FAILED, {
      actor: { user_id: user.id, email, role: user.role },
      target_user_id: user.id, target_table: 'users', target_id: user.id,
      details: { reason: 'bad_password' },
    });
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  await audit.log(req, audit.ACTIONS.LOGIN, {
    actor: { user_id: user.id, email: user.email, role: user.role },
    target_user_id: user.id, target_table: 'users', target_id: user.id,
  });

  const loginData = issueLoginResponse(user);
  setAuthCookie(res, loginData.token);
  return res.json(loginData);
});

router.post('/google', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing credential.' });

  const profile = await verifyGoogleCredential(credential);
  if (!profile) {
    await audit.log(req, audit.ACTIONS.LOGIN_GOOGLE_FAILED, {
      actor: { user_id: null, email: null, role: null },
      details: { reason: 'invalid_credential' },
    });
    return res.status(401).json({ error: 'Invalid Google credential.' });
  }

  let { data: user } = await supabase
    .from('users').select('id, email, name, role, status, google_sub').eq('google_sub', profile.sub).maybeSingle();
  if (!user) {
    const r = await supabase.from('users')
      .select('id, email, name, role, status, google_sub').eq('email', profile.email).maybeSingle();
    user = r.data;
  }

  if (!user) {
    await audit.log(req, audit.ACTIONS.LOGIN_GOOGLE_FAILED, {
      actor: { user_id: null, email: profile.email, role: null },
      details: { reason: 'no_account' },
    });
    return res.status(403).json({ error: 'No account found. Please register first.' });
  }
  if (user.status === 'Pending') {
    await audit.log(req, audit.ACTIONS.LOGIN_GOOGLE_FAILED, {
      actor: { user_id: user.id, email: user.email, role: user.role },
      target_user_id: user.id, target_table: 'users', target_id: user.id,
      details: { reason: 'pending' },
    });
    return res.status(403).json({ error: 'Your account is awaiting approval.' });
  }
  if (user.status === 'Inactive') {
    await audit.log(req, audit.ACTIONS.LOGIN_GOOGLE_FAILED, {
      actor: { user_id: user.id, email: user.email, role: user.role },
      target_user_id: user.id, target_table: 'users', target_id: user.id,
      details: { reason: 'inactive' },
    });
    return res.status(403).json({ error: 'Your account has been deactivated.' });
  }

  if (!user.google_sub) {
    await supabase.from('users').update({ google_sub: profile.sub }).eq('id', user.id);
  }
  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  await audit.log(req, audit.ACTIONS.LOGIN_GOOGLE, {
    actor: { user_id: user.id, email: user.email, role: user.role },
    target_user_id: user.id, target_table: 'users', target_id: user.id,
  });

  const loginData = issueLoginResponse(user);
  setAuthCookie(res, loginData.token);
  return res.json(loginData);
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

  await audit.log(req, audit.ACTIONS.GOOGLE_LINKED, {
    target_user_id: req.user.user_id,
    target_table: 'users',
    target_id: req.user.user_id,
  });

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

  await audit.log(req, audit.ACTIONS.PASSWORD_CHANGED, {
    target_user_id: req.user.user_id,
    target_table: 'users',
    target_id: req.user.user_id,
    details: { had_previous: !!user.password_hash },
  });

  return res.json({ success: true, message: 'Password updated.' });
});

module.exports = router;
