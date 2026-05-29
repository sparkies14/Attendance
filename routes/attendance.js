const router = require('express').Router();
const supabase = require('../lib/supabase');
const { sendMessage, CHANNELS } = require('../lib/discord');
const { classifyLateStatus, timeToMinutes, calcNetHours, calcRawHours } = require('../lib/rules');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.post('/', async (req, res) => {
  const email = req.user.email; // trust the JWT, ignore body.email
  const {
    action, entry_type, local_time, date,
    jst_hour, jst_minute, fingerprint, reason, leave_type,
  } = req.body || {};

  const { data: user } = await supabase
    .from('users').select('name, job_role, status').eq('email', email).maybeSingle();
  if (!user || user.status !== 'Active') {
    return res.status(403).json({ error: 'Your account is not active.' });
  }
  const officialName = user.name;
  const role = user.job_role;

  const late_status = action === 'clock-in'
    ? classifyLateStatus(Number(jst_hour), Number(jst_minute))
    : '';

  if (entry_type === 'manual' && action === 'clock-in') {
    const { error } = await supabase.from('attendance').insert({
      email, name: officialName, date,
      clock_in: local_time, clock_out: '', total_hours: 0,
      entry_type, status: 'Pending', late_status, reason, fingerprint, role,
    });
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.approvals,
      `📋 **Manual Entry** — ${officialName}\nDate: ${date} | Time: ${local_time} | Reason: ${reason}`);
    return res.json({ success: true, message: 'Manual entry submitted! Waiting for manager approval.' });
  }

  if (action === 'clock-in') {
    const { data: existing } = await supabase
      .from('attendance')
      .select('id, clock_in, clock_out, last_clock_in, accumulated_hours')
      .eq('email', email).eq('date', date).maybeSingle();

    if (existing) {
      // Already clocked in (no clock_out yet) — block
      if (!existing.clock_out || existing.clock_out === '') {
        return res.status(400).json({ error: 'You are already clocked in.' });
      }

      // Re-clock-in: closed segment exists, accumulate its raw hours
      const segmentFrom = existing.last_clock_in || existing.clock_in;
      const rawSegmentHours = calcRawHours(segmentFrom, existing.clock_out);
      const new_accumulated = (existing.accumulated_hours || 0) + rawSegmentHours;

      const { error } = await supabase.from('attendance')
        .update({ last_clock_in: local_time, clock_out: '', accumulated_hours: new_accumulated })
        .eq('id', existing.id);
      if (error) return res.status(500).json({ error: error.message });
      await sendMessage(CHANNELS.clockLogs,
        `🟡 **Re-Clock In** — ${officialName} | ${date} ${local_time} (resumed)`);
      return res.json({ success: true, message: 'Re-clock in recorded!' });
    }

    // First clock-in of the day
    const { error } = await supabase.from('attendance').insert({
      email, name: officialName, date,
      clock_in: local_time, clock_out: '', total_hours: 0,
      last_clock_in: local_time, accumulated_hours: 0,
      entry_type, status: 'Approved', late_status, reason: '', fingerprint, role,
    });
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.clockLogs,
      `🟢 **Clock In** — ${officialName} | ${date} ${local_time} | ${late_status}`);
    return res.json({ success: true, message: 'Clock in recorded!' });
  }

  if (action === 'clock-out') {
    const { data: row } = await supabase
      .from('attendance')
      .select('id, clock_in, clock_out, last_clock_in, accumulated_hours')
      .eq('email', email).eq('date', date).maybeSingle();
    if (!row) return res.status(400).json({ error: 'No clock-in record found for today.' });
    if (row.clock_out && row.clock_out !== '') {
      return res.status(400).json({ error: 'You have already clocked out today.' });
    }

    const segmentFrom = row.last_clock_in || row.clock_in;
    const current_raw_hours = calcRawHours(segmentFrom, local_time);
    const total_raw_hours = (row.accumulated_hours || 0) + current_raw_hours;
    const total_hours = Math.max(0, Math.round((total_raw_hours - 1) * 100) / 100);

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
      email, name: officialName, date, leave_type, reason, status: 'Pending',
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: '🏖️ Leave request submitted! Manager will review shortly.' });
  }

  if (action === 'lunch-out') {
    const { error } = await supabase.from('lunch_log').insert({
      name: officialName, date, lunch_out: local_time, lunch_in: '', duration_mins: 0,
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
      name: officialName, date, break_out: local_time, break_in: '', duration_mins: 0,
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
