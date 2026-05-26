const router = require('express').Router();
const supabase = require('../lib/supabase');
const { sendMessage, CHANNELS } = require('../lib/discord');
const { classifyLateStatus, timeToMinutes, calcNetHours } = require('../lib/rules');

router.post('/', async (req, res) => {
  const {
    email, action, entry_type, local_time, date,
    jst_hour, jst_minute, fingerprint, reason, leave_type
  } = req.body;

  // Verify member — use official name from DB, not browser input
  const { data: member } = await supabase
    .from('members').select('name, role').eq('email', email).maybeSingle();
  if (!member) {
    return res.status(400).json({ error: 'Your name is not registered. Please contact your manager.' });
  }
  const officialName = member.name;
  const role = member.role;

  // Late classification only applies to clock-in
  const late_status = action === 'clock-in'
    ? classifyLateStatus(Number(jst_hour), Number(jst_minute))
    : '';

  // Manual entry — any action except leave goes to pending approval
  if (entry_type === 'manual' && action === 'clock-in') {
    const { error } = await supabase.from('attendance').insert({
      email, name: officialName, date,
      clock_in: local_time, clock_out: '', total_hours: 0,
      entry_type, status: 'Pending', late_status, reason, fingerprint, role
    });
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.approvals,
      `📋 **Manual Entry** — ${officialName}\nDate: ${date} | Time: ${local_time} | Reason: ${reason}`);
    return res.json({ success: true, message: 'Manual entry submitted! Waiting for manager approval.' });
  }

  // Auto entry — branch on action
  if (action === 'clock-in') {
    const { data: dup } = await supabase
      .from('attendance').select('id').eq('email', email).eq('date', date).maybeSingle();
    if (dup) return res.status(400).json({ error: 'You already clocked in today. Use Clock Out instead.' });

    const { error } = await supabase.from('attendance').insert({
      email, name: officialName, date,
      clock_in: local_time, clock_out: '', total_hours: 0,
      entry_type, status: 'Approved', late_status, reason: '', fingerprint, role
    });
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.clockLogs,
      `🟢 **Clock In** — ${officialName} | ${date} ${local_time} | ${late_status}`);
    return res.json({ success: true, message: 'Clock in recorded!' });
  }

  if (action === 'clock-out') {
    const { data: row } = await supabase
      .from('attendance').select('id, clock_in').eq('email', email).eq('date', date).maybeSingle();
    if (!row) return res.status(400).json({ error: 'No clock-in record found for today.' });

    // Policy §3: subtract 1h unpaid lunch from net hours; minimum 0
    const total_hours = calcNetHours(row.clock_in, local_time);
    const { error } = await supabase.from('attendance')
      .update({ clock_out: local_time, total_hours, status: 'Approved' })
      .eq('id', row.id);
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.clockLogs,
      `🔴 **Clock Out** — ${officialName} | ${date} ${local_time} | Net: ${total_hours}h`);
    return res.json({ success: true, message: 'Clock out recorded!' });
  }

  if (action === 'leave') {
    const { error } = await supabase.from('leave_log').insert({
      email, name: officialName, date, leave_type, reason, status: 'Pending'
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: '🏖️ Leave request submitted! Manager will review shortly.' });
  }

  if (action === 'lunch-out') {
    const { error } = await supabase.from('lunch_log').insert({
      name: officialName, date, lunch_out: local_time, lunch_in: '', duration_mins: 0
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Lunch out recorded!' });
  }

  if (action === 'lunch-in') {
    const { data: lunchRow } = await supabase
      .from('lunch_log').select('id, lunch_out').eq('name', officialName).eq('date', date).maybeSingle();
    if (!lunchRow) return res.status(400).json({ error: 'No lunch-out record found.' });
    const duration_mins = timeToMinutes(local_time) - timeToMinutes(lunchRow.lunch_out);
    const { error } = await supabase.from('lunch_log')
      .update({ lunch_in: local_time, duration_mins }).eq('id', lunchRow.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Lunch in recorded!' });
  }

  if (action === 'break-out') {
    const { error } = await supabase.from('break_log').insert({
      name: officialName, date, break_out: local_time, break_in: '', duration_mins: 0
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Break out recorded!' });
  }

  if (action === 'break-in') {
    const { data: breakRow } = await supabase
      .from('break_log').select('id, break_out').eq('name', officialName).eq('date', date).maybeSingle();
    if (!breakRow) return res.status(400).json({ error: 'No break-out record found.' });
    const duration_mins = timeToMinutes(local_time) - timeToMinutes(breakRow.break_out);
    const { error } = await supabase.from('break_log')
      .update({ break_in: local_time, duration_mins }).eq('id', breakRow.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Break in recorded!' });
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
});

module.exports = router;
