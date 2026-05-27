const supabase = require('./supabase');
const { computeBalance } = require('./leaveBalance');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateRange(query) {
  const now = new Date();
  const y   = now.getFullYear();
  const mo  = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  return {
    from: query.from || `${y}-${mo}-01`,
    to:   query.to   || `${y}-${mo}-${d}`,
  };
}

function validateDateRange(from, to) {
  return DATE_RE.test(from) && DATE_RE.test(to) && from <= to;
}

async function fetchTardyData(from, to) {
  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, email, name, country')
    .eq('status', 'Active')
    .neq('role', 'owner');
  if (membersErr) throw new Error(membersErr.message);

  const { data: attendance, error: attErr } = await supabase
    .from('attendance')
    .select('email, date, late_status')
    .gte('date', from)
    .lte('date', to);
  if (attErr) throw new Error(attErr.message);

  const attRows = attendance || [];

  const result = (members || []).map(m => {
    const country  = m.country || 'PH';
    const mEmail   = (m.email || '').toLowerCase();
    const rows     = attRows.filter(r => (r.email || '').toLowerCase() === mEmail);
    const minor    = rows.filter(r => r.late_status === 'MINOR TARDY').length;
    const major    = rows.filter(r => r.late_status === 'MAJOR TARDY').length;
    const awolHalf = rows.filter(r => r.late_status === 'AWOL HALF DAY').length;
    const awolFull = rows.filter(r => r.late_status === 'AWOL FULL DAY').length;
    return { name: m.name, email: m.email, country, minor, major, awolHalf, awolFull, total: minor + major + awolHalf + awolFull };
  });

  const countryMap = {};
  for (const m of result) {
    if (!countryMap[m.country]) countryMap[m.country] = { country: m.country, minor: 0, major: 0, awolHalf: 0, awolFull: 0, total: 0 };
    countryMap[m.country].minor    += m.minor;
    countryMap[m.country].major    += m.major;
    countryMap[m.country].awolHalf += m.awolHalf;
    countryMap[m.country].awolFull += m.awolFull;
    countryMap[m.country].total    += m.total;
  }

  return { from, to, members: result, byCountry: Object.values(countryMap) };
}

async function fetchLeaveData(from, to) {
  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, email, name, created_at')
    .eq('status', 'Active')
    .neq('role', 'owner');
  if (membersErr) throw new Error(membersErr.message);

  const { data: leaveLog, error: leaveErr } = await supabase
    .from('leave_log')
    .select('email, created_at')
    .eq('status', 'Approved');
  if (leaveErr) throw new Error(leaveErr.message);

  const { data: adjData, error: adjErr } = await supabase
    .from('leave_adjustments')
    .select('user_id, amount');
  if (adjErr) throw new Error(adjErr.message);

  const leaveRows = leaveLog || [];
  const adjRows   = adjData  || [];
  const currentYear = new Date().getFullYear();

  const result = (members || []).map(m => {
    const hireYear   = m.created_at ? new Date(m.created_at).getFullYear() : currentYear;
    const mEmail     = (m.email || '').toLowerCase();
    const memberLeaves = leaveRows.filter(l => (l.email || '').toLowerCase() === mEmail);
    const used       = memberLeaves.length;
    const usedInRange = memberLeaves.filter(l => {
      const d = (l.created_at || '').slice(0, 10); // YYYY-MM-DD portion
      return d >= from && d <= to;
    }).length;
    const adjustments = adjRows.filter(a => a.user_id === m.id).reduce((s, a) => s + a.amount, 0);
    const { grantsEarned, balance } = computeBalance({ hireYear, currentYear, used, adjustments });
    return { name: m.name, email: m.email, entitled: grantsEarned, used, remaining: balance, usedInRange };
  });

  return { from, to, members: result };
}

async function fetchDisciplineData(from, to) {
  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('status', 'Active')
    .neq('role', 'owner');
  if (membersErr) throw new Error(membersErr.message);

  const { data: discData, error: discErr } = await supabase
    .from('discipline_records')
    .select('user_id, voided, issued_at');
  if (discErr) throw new Error(discErr.message);

  const discRows = discData || [];

  const result = (members || []).map(m => {
    const memberRecs = discRows.filter(r => r.user_id === m.id);
    const total = memberRecs.length;
    const active = memberRecs.filter(r => r.voided === false).length;
    const voided = memberRecs.filter(r => r.voided === true).length;
    const issuedInRange = memberRecs.filter(r => {
      const d = (r.issued_at || '').slice(0, 10); // YYYY-MM-DD portion
      return d >= from && d <= to;
    }).length;
    return { name: m.name, email: m.email, total, active, voided, issuedInRange };
  });

  return { from, to, members: result };
}

module.exports = { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData, fetchDisciplineData };
