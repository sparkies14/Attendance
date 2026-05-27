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
  return DATE_RE.test(from) && DATE_RE.test(to);
}

module.exports = { parseDateRange, validateDateRange };
