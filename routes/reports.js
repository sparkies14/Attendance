const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData, fetchDisciplineData, fetchAttentionData } = require('../lib/reportData');

function escapeCSV(val) {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSV(headers, rows) {
  const headerLine = headers.join(',');
  const dataLines  = rows.map(r => r.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

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

router.get('/export/tardy.csv', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  try {
    const data = await fetchTardyData(from, to);
    const headers = ['Name', 'Email', 'Country', 'Minor', 'Major', 'AWOL Half', 'AWOL Full', 'Total'];
    const rows = data.members.map(m => [m.name, m.email, m.country, m.minor, m.major, m.awolHalf, m.awolFull, m.total]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tardy-${from}-to-${to}.csv"`);
    return res.send(toCSV(headers, rows));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/export/leave.csv', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  try {
    const data = await fetchLeaveData(from, to);
    const headers = ['Name', 'Email', 'Entitled', 'Used', 'Remaining', 'Used In Range'];
    const rows = data.members.map(m => [m.name, m.email, m.entitled, m.used, m.remaining, m.usedInRange]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leave-${from}-to-${to}.csv"`);
    return res.send(toCSV(headers, rows));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/export/discipline.csv', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  try {
    const data = await fetchDisciplineData(from, to);
    const headers = ['Name', 'Email', 'Total Warnings', 'Active', 'Voided', 'Issued In Range'];
    const rows = data.members.map(m => [m.name, m.email, m.total, m.active, m.voided, m.issuedInRange]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="discipline-${from}-to-${to}.csv"`);
    return res.send(toCSV(headers, rows));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
