const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData } = require('../lib/reportData');

router.use(requireAuth);

router.get('/tardy', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  try {
    return res.json(await fetchTardyData(from, to));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/leave', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  try {
    return res.json(await fetchLeaveData(from, to));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
