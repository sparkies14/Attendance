async function fetchHolidays(country, year, apiKey) {
  const url = `https://calendarific.com/api/v2/holidays?api_key=${encodeURIComponent(apiKey)}&country=${encodeURIComponent(country)}&year=${year}`;
  const res = await fetch(url);
  let body = {};
  try { body = await res.json(); } catch { body = {}; }
  if (!res.ok || !body.meta || body.meta.code !== 200) {
    const detail = body && body.meta && body.meta.error_detail;
    throw new Error(detail || `HTTP ${res.status}`);
  }
  const list = (body.response && body.response.holidays) || [];
  return list
    .filter(h => Array.isArray(h.type) && h.type.includes('National holiday'))
    .map(h => ({ date: String(h.date.iso).slice(0, 10), name: h.name }));
}
module.exports = { fetchHolidays };
