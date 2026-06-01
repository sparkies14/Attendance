const router = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const audit = require('../lib/audit');

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;

router.use(requireAuth);

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  const type = req.query.type === 'leave' ? 'leave' : 'attendance';

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const actions = type === 'leave'
    ? [audit.ACTIONS.LEAVE_APPROVED, audit.ACTIONS.LEAVE_REJECTED]
    : [audit.ACTIONS.ATTENDANCE_APPROVED, audit.ACTIONS.ATTENDANCE_REJECTED];

  const { data: rows, error } = await supabase
    .from('audit_log')
    .select('id, action, actor_email, target_id, occurred_at')
    .in('action', actions)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });

  const sourceTable = type === 'leave' ? 'leave_log' : 'attendance';
  const ids = (rows || [])
    .map(r => parseInt(r.target_id, 10))
    .filter(Number.isInteger);

  const nameById = {};
  const labelById = {};
  if (ids.length) {
    const cols = type === 'leave' ? 'id, name, leave_type' : 'id, name';
    const { data: src } = await supabase.from(sourceTable).select(cols).in('id', ids);
    (src || []).forEach(s => {
      nameById[s.id] = s.name;
      if (type === 'leave') labelById[s.id] = s.leave_type;
    });
  }

  const approvedActions = [audit.ACTIONS.LEAVE_APPROVED, audit.ACTIONS.ATTENDANCE_APPROVED];
  const items = (rows || []).map(r => {
    const tid = parseInt(r.target_id, 10);
    return {
      id: r.id,
      result: approvedActions.includes(r.action) ? 'approved' : 'rejected',
      name: nameById[tid] || `Entry #${r.target_id}`,
      label: type === 'leave' ? (labelById[tid] || 'Leave') : 'clock-in',
      actor: r.actor_email,
      occurred_at: r.occurred_at,
    };
  });

  res.json({ items });
});

module.exports = router;
