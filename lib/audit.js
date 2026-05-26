const supabase = require('./supabase');

const ACTIONS = Object.freeze({
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGIN_GOOGLE: 'login_google',
  LOGIN_GOOGLE_FAILED: 'login_google_failed',
  REGISTER: 'register',
  PASSWORD_CHANGED: 'password_changed',
  GOOGLE_LINKED: 'google_linked',
  USER_INVITED: 'user_invited',
  USER_PROMOTED: 'user_promoted',
  USER_DEMOTED: 'user_demoted',
  USER_ACTIVATED: 'user_activated',
  USER_DEACTIVATED: 'user_deactivated',
  ATTENDANCE_APPROVED: 'attendance_approved',
  ATTENDANCE_REJECTED: 'attendance_rejected',
  LEAVE_APPROVED: 'leave_approved',
  LEAVE_REJECTED: 'leave_rejected',
  AUDIT_CLEANUP: 'audit_cleanup',
});

function extractIp(req) {
  if (!req || !req.headers) return null;
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const first = String(fwd).split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || null;
}

function extractActor(req, opts) {
  if (opts && opts.actor) return {
    user_id: opts.actor.user_id ?? null,
    email:   opts.actor.email   ?? null,
    role:    opts.actor.role    ?? null,
  };
  if (req && req.user) return {
    user_id: req.user.user_id ?? null,
    email:   req.user.email   ?? null,
    role:    req.user.role    ?? null,
  };
  return { user_id: null, email: null, role: null };
}

async function log(req, action, opts = {}) {
  try {
    const actor = extractActor(req, opts);
    await supabase.from('audit_log').insert({
      actor_user_id:  actor.user_id,
      actor_email:    actor.email,
      actor_role:     actor.role,
      action,
      target_user_id: opts.target_user_id ?? null,
      target_table:   opts.target_table   ?? null,
      target_id:      opts.target_id != null ? String(opts.target_id) : null,
      details:        opts.details        ?? null,
      ip_address:     extractIp(req),
      user_agent:     req?.headers?.['user-agent'] ?? null,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { log, ACTIONS, extractIp, extractActor };
