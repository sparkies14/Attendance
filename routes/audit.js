const router = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const audit = require('../lib/audit');

router.use(requireAuth);

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE = 1000;

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  let page = parseInt(req.query.page);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (page > MAX_PAGE) page = MAX_PAGE;

  let pageSize = parseInt(req.query.page_size);
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  const { actor, action, from, to } = req.query;

  let q = supabase.from('audit_log')
    .select('*', { count: 'exact' })
    .order('occurred_at', { ascending: false });

  if (actor)  q = q.eq('actor_email', actor);
  if (action) q = q.eq('action', action);
  if (from)   q = q.gte('occurred_at', from);
  if (to)     q = q.lte('occurred_at', to);

  const fromRow = (page - 1) * pageSize;
  const toRow   = fromRow + pageSize - 1;
  q = q.range(fromRow, toRow);

  const { data, count, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    page,
    page_size: pageSize,
    total: count ?? 0,
    items: data || [],
  });
});

router.delete('/', requireRole('owner'), async (req, res) => {
  const beforeStr = req.query.before;
  if (!beforeStr) return res.status(400).json({ error: 'before query param required.' });

  const before = new Date(beforeStr);
  if (isNaN(before.getTime())) return res.status(400).json({ error: 'Invalid before date.' });

  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  if (before > cutoff) {
    return res.status(400).json({ error: 'before must be at least 24 hours in the past.' });
  }

  const { count, error: e1 } = await supabase.from('audit_log')
    .select('id', { count: 'exact', head: true })
    .lt('occurred_at', before.toISOString());
  if (e1) return res.status(500).json({ error: e1.message });

  const { error: e2 } = await supabase.from('audit_log')
    .delete()
    .lt('occurred_at', before.toISOString());
  if (e2) return res.status(500).json({ error: e2.message });

  await audit.log(req, audit.ACTIONS.AUDIT_CLEANUP, {
    details: { before_date: before.toISOString(), rows_deleted: count ?? 0 },
  });

  return res.json({ success: true, rows_deleted: count ?? 0, before: before.toISOString() });
});

module.exports = router;
