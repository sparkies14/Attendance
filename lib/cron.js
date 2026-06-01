const cron     = require('node-cron');
const supabase = require('./supabase');

async function runAwolCheck(dateStr) {
  const date = dateStr || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });

  const { data: members, error: membersError } = await supabase
    .from('users')
    .select('email, name, role, job_role')
    .eq('role', 'member')
    .eq('status', 'Active');

  if (membersError) {
    console.error('AWOL check failed (fetch members):', membersError.message);
    return { inserted: 0, skipped: 0, date };
  }

  let inserted = 0;
  let skipped  = 0;

  for (const member of members || []) {
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('email', member.email)
      .eq('date', date)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    await supabase.from('attendance').insert({
      email:       member.email,
      name:        member.name,
      role:        member.job_role || member.role,
      date,
      status:      'Approved',
      late_status: 'AWOL FULL DAY',
      entry_type:  'auto',
    });
    inserted++;
  }

  console.log(`AWOL check ${date}: ${inserted} inserted, ${skipped} skipped`);
  return { inserted, skipped, date };
}

function registerCron() {
  cron.schedule('0 18 * * 1-5', () => runAwolCheck(), { timezone: 'Asia/Tokyo' });
  console.log('AWOL cron registered: 18:00 JST weekdays');

  // Keep Render warm — ping self every 10 minutes so the server never cold-starts
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
  if (selfUrl) {
    cron.schedule('*/10 * * * *', () => {
      fetch(`${selfUrl}/health`).catch(() => {});
    });
    console.log('Keep-alive ping registered: every 10 min →', selfUrl);
  }
}

module.exports = { runAwolCheck, registerCron };
