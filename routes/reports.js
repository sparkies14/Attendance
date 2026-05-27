const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { parseDateRange, validateDateRange } = require('../lib/reportData');

router.use(requireAuth);

router.get('/tardy', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  return res.status(501).json({ error: 'Not yet implemented.' });
});

module.exports = router;
