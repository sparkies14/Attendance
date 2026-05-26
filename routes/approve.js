const router = require('express').Router();
const supabase = require('../lib/supabase');
const { sendMessage, CHANNELS } = require('../lib/discord');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);
router.use(requireRole('owner', 'admin'));

router.get('/', async (req, res) => {
  const { action, row, type } = req.query;
  const id = parseInt(row);

  if (!id || id <= 0) return res.status(400).json({ error: 'Invalid row id.' });
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject".' });
  }

  const new_status = action === 'approve' ? 'Approved' : 'Rejected';
  const table = type === 'leave' ? 'leave_log' : 'attendance';

  const { error } = await supabase.from(table).update({ status: new_status }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  await sendMessage(CHANNELS.approvals,
    `${action === 'approve' ? '✅' : '❌'} Entry #${id} (${type}) has been **${new_status}**.`);
  res.json({ success: true, message: 'Status updated successfully!' });
});

module.exports = router;
