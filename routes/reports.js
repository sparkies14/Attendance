const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData, fetchDisciplineData, fetchAttentionData } = require('../lib/reportData');

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

router.get('/discipline', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  try {
    return res.json(await fetchDisciplineData(from, to));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/attention', requireRole('owner', 'admin'), async (req, res) => {
  try {
    return res.json(await fetchAttentionData());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/deductions', requireRole('owner', 'admin'), (_req, res) => {
  return res.json({ message: 'Deduction reporting available after Phase 6.', data: [] });
});

module.exports = router;
