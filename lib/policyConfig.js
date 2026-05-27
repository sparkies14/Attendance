const supabase = require('./supabase');

async function getThresholds() {
  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) throw new Error(error.message);
  const map = {};
  for (const row of data || []) map[row.key] = parseInt(row.value, 10);
  return {
    minor:    map.threshold_minor_tardy ?? 3,
    major:    map.threshold_major_tardy ?? 2,
    awolHalf: map.threshold_awol_half   ?? 1,
    awolFull: map.threshold_awol_full   ?? 1,
  };
}

function isOverThreshold(counts, thresholds) {
  const reasons = [];
  if (counts.minor    >= thresholds.minor)    reasons.push(`${counts.minor} minor tardies (limit: ${thresholds.minor})`);
  if (counts.major    >= thresholds.major)    reasons.push(`${counts.major} major tardies (limit: ${thresholds.major})`);
  if (counts.awolHalf >= thresholds.awolHalf) reasons.push(`${counts.awolHalf} AWOL half days (limit: ${thresholds.awolHalf})`);
  if (counts.awolFull >= thresholds.awolFull) reasons.push(`${counts.awolFull} AWOL full days (limit: ${thresholds.awolFull})`);
  return { exceeded: reasons.length > 0, reasons };
}

module.exports = { getThresholds, isOverThreshold };
