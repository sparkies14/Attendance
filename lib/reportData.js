const supabase = require('./supabase');

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

module.exports = { parseDateRange, validateDateRange, fetchTardyData };
