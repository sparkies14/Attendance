# Phase 9A — Backend Reporting APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lib/reportData.js` and `routes/reports.js` to the Express backend providing JSON analytics, CSV, and PDF export endpoints for tardy, leave, and discipline data — admin/owner only.

**Architecture:** A shared `lib/reportData.js` module holds all data-fetching functions (called by both JSON routes and export routes to avoid duplicated DB queries). `routes/reports.js` handles HTTP concerns — date validation, CSV/PDF serialization, role gating — and is mounted at `/reports` in `server.js`. Tests mock supabase at the module level exactly as `tests/discipline.test.js` does.

**Tech Stack:** Node.js/Express 4, Supabase JS v2, Jest + supertest, pdfkit (new dependency).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `lib/reportData.js` | Data-fetching functions + date helpers |
| Create | `routes/reports.js` | All /reports endpoints, CSV/PDF serialization |
| Create | `tests/reports.test.js` | Integration tests |
| Modify | `server.js` | Mount `/reports` router |

---

### Task 1: Install pdfkit + scaffold `lib/reportData.js`, `routes/reports.js`, `tests/reports.test.js`

**Files:**
- Create: `lib/reportData.js`
- Create: `routes/reports.js`
- Create: `tests/reports.test.js`

- [ ] **Step 1: Install pdfkit**

```bash
cd /home/erwindev/Attendance && npm install pdfkit
```

Expected: `pdfkit` appears in `package.json` dependencies.

- [ ] **Step 2: Create `lib/reportData.js` with `parseDateRange` and `validateDateRange`**

```js
const supabase        = require('./supabase');
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
  return DATE_RE.test(from) && DATE_RE.test(to);
}

module.exports = { parseDateRange, validateDateRange };
```

- [ ] **Step 3: Create `routes/reports.js` skeleton with a stub `/tardy` route**

```js
const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { parseDateRange, validateDateRange } = require('../lib/reportData');

router.use(requireAuth);

router.get('/tardy', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  return res.status(501).json({ error: 'Not yet implemented.' });
});

module.exports = router;
```

- [ ] **Step 4: Create `tests/reports.test.js` scaffold with 403 and 400 tests**

```js
const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
  next();
});
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/reports');

function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:        (resolve) => resolve(result),
    catch:       () => Promise.resolve(result),
    select:      jest.fn(() => ch),
    eq:          jest.fn(() => ch),
    neq:         jest.fn(() => ch),
    gte:         jest.fn(() => ch),
    lte:         jest.fn(() => ch),
    order:       jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single:      jest.fn(() => Promise.resolve(result)),
    insert:      jest.fn(() => ch),
    update:      jest.fn(() => ch),
  };
  return ch;
}

function makeApp(role, email) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email, role }; next(); });
  app.use('/', router);
  return app;
}

const MEMBER = {
  id: 'user-1',
  email: 'ana@test.com',
  name: 'Ana Reyes',
  country: 'PH',
  created_at: '2020-01-01T00:00:00Z',
};

const ATT_ROW = {
  email: 'ana@test.com',
  date: '2026-05-10',
  late_status: 'MINOR TARDY',
};

const LEAVE_ROW = {
  email: 'ana@test.com',
  status: 'Approved',
  created_at: '2026-05-15T00:00:00Z',
};

const DISC_REC = {
  user_id: 'user-1',
  voided: false,
  issued_at: '2026-05-10T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

/* ─── GET /tardy ─── */
describe('GET /tardy', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/tardy');
    expect(res.status).toBe(403);
  });

  test('400 when from is malformed', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=not-a-date&to=2026-05-27');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('400 when to is malformed', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });
});
```

- [ ] **Step 5: Run tests — verify 3 tests pass**

```bash
cd /home/erwindev/Attendance && npx jest tests/reports.test.js --no-coverage 2>&1 | tail -10
```

Expected: 3 tests pass (403 + 2× 400).

- [ ] **Step 6: Commit**

```bash
git add lib/reportData.js routes/reports.js tests/reports.test.js package.json package-lock.json
git commit -m "feat: Phase 9A scaffold — reportData helpers, reports router, test setup"
```

---

### Task 2: `fetchTardyData` + `GET /reports/tardy`

**Files:**
- Modify: `lib/reportData.js` (add `fetchTardyData`)
- Modify: `routes/reports.js` (implement `/tardy` handler)
- Modify: `tests/reports.test.js` (add full GET /tardy tests)

- [ ] **Step 1: Add failing tests for GET /tardy to `tests/reports.test.js`**

Replace the existing `describe('GET /tardy', () => {` block entirely with this:

```js
/* ─── GET /tardy ─── */
describe('GET /tardy', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/tardy');
    expect(res.status).toBe(403);
  });

  test('400 when from is malformed', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=not-a-date&to=2026-05-27');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('400 when to is malformed', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('200 — returns per-member counts and country rollup', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));    // users
    supabase.from.mockReturnValueOnce(c([ATT_ROW]));   // attendance
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2026-05-01');
    expect(res.body.to).toBe('2026-05-27');
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].email).toBe('ana@test.com');
    expect(res.body.members[0].minor).toBe(1);
    expect(res.body.members[0].total).toBe(1);
    expect(res.body.byCountry).toHaveLength(1);
    expect(res.body.byCountry[0].country).toBe('PH');
    expect(res.body.byCountry[0].minor).toBe(1);
  });

  test('200 — empty members when no active users', async () => {
    supabase.from.mockReturnValueOnce(c([]));  // users
    supabase.from.mockReturnValueOnce(c([]));  // attendance
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(0);
    expect(res.body.byCountry).toHaveLength(0);
  });

  test('500 when DB error on users query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });

  test('500 when DB error on attendance query', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /tardy" 2>&1 | tail -10
```

Expected: 200/500 tests fail (route returns 501).

- [ ] **Step 3: Add `fetchTardyData` to `lib/reportData.js`**

Add after `validateDateRange`:

```js
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
    const rows     = attRows.filter(r => r.email === m.email);
    const minor    = rows.filter(r => r.late_status === 'MINOR TARDY').length;
    const major    = rows.filter(r => r.late_status === 'MAJOR TARDY').length;
    const awolHalf = rows.filter(r => r.late_status === 'AWOL HALF DAY').length;
    const awolFull = rows.filter(r => r.late_status === 'AWOL FULL DAY').length;
    return { name: m.name, email: m.email, country, minor, major, awolHalf, awolFull, total: minor + major + awolHalf + awolFull };
  });

  const countryMap = {};
  for (const m of result) {
    if (!countryMap[m.country]) countryMap[m.country] = { country: m.country, minor: 0, major: 0, awolHalf: 0, awolFull: 0 };
    countryMap[m.country].minor    += m.minor;
    countryMap[m.country].major    += m.major;
    countryMap[m.country].awolHalf += m.awolHalf;
    countryMap[m.country].awolFull += m.awolFull;
  }

  return { from, to, members: result, byCountry: Object.values(countryMap) };
}
```

Also update the `module.exports` line at the bottom:

```js
module.exports = { parseDateRange, validateDateRange, fetchTardyData };
```

- [ ] **Step 4: Update the `/tardy` route handler in `routes/reports.js`**

Replace the stub handler with:

```js
const { parseDateRange, validateDateRange, fetchTardyData } = require('../lib/reportData');

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
```

- [ ] **Step 5: Run tardy tests — verify all pass**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /tardy" 2>&1 | tail -10
```

Expected: 7 tests green.

- [ ] **Step 6: Commit**

```bash
git add lib/reportData.js routes/reports.js tests/reports.test.js
git commit -m "feat: GET /reports/tardy — tardy counts and country rollup"
```

---

### Task 3: `fetchLeaveData` + `GET /reports/leave`

**Files:**
- Modify: `lib/reportData.js` (add `fetchLeaveData`)
- Modify: `routes/reports.js` (add `/leave` route)
- Modify: `tests/reports.test.js` (add GET /leave tests)

- [ ] **Step 1: Add failing tests — append to `tests/reports.test.js`**

```js
/* ─── GET /leave ─── */
describe('GET /leave', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/leave');
    expect(res.status).toBe(403);
  });

  test('400 when dates malformed', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/leave?from=bad&to=2026-05-27');
    expect(res.status).toBe(400);
  });

  test('200 — returns per-member leave balances and usedInRange', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));      // users
    supabase.from.mockReturnValueOnce(c([LEAVE_ROW]));   // leave_log
    supabase.from.mockReturnValueOnce(c([]));             // leave_adjustments
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].email).toBe('ana@test.com');
    expect(res.body.members[0].used).toBe(1);
    expect(res.body.members[0].usedInRange).toBe(1);
    expect(typeof res.body.members[0].entitled).toBe('number');
    expect(typeof res.body.members[0].remaining).toBe('number');
  });

  test('200 — usedInRange is 0 when leave was outside date range', async () => {
    const OLD_LEAVE = { ...LEAVE_ROW, created_at: '2025-01-10T00:00:00Z' };
    supabase.from.mockReturnValueOnce(c([MEMBER]));       // users
    supabase.from.mockReturnValueOnce(c([OLD_LEAVE]));    // leave_log
    supabase.from.mockReturnValueOnce(c([]));              // leave_adjustments
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.members[0].used).toBe(1);
    expect(res.body.members[0].usedInRange).toBe(0);
  });

  test('500 when DB error on users query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });

  test('500 when DB error on leave_log query', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /leave" 2>&1 | tail -10
```

Expected: FAIL (route doesn't exist yet).

- [ ] **Step 3: Add `fetchLeaveData` to `lib/reportData.js`**

Add after `fetchTardyData`:

```js
async function fetchLeaveData(from, to) {
  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, email, name, created_at')
    .eq('status', 'Active')
    .neq('role', 'owner');
  if (membersErr) throw new Error(membersErr.message);

  const { data: allLeaves, error: leavesErr } = await supabase
    .from('leave_log')
    .select('email, status, created_at')
    .eq('status', 'Approved');
  if (leavesErr) throw new Error(leavesErr.message);

  const { data: allAdj, error: adjErr } = await supabase
    .from('leave_adjustments')
    .select('user_id, amount');
  if (adjErr) throw new Error(adjErr.message);

  const year   = new Date().getFullYear();
  const leaves = allLeaves || [];
  const adjs   = allAdj   || [];

  const result = (members || []).map(m => {
    const hireYear     = new Date(m.created_at).getFullYear();
    const memberLeaves = leaves.filter(l => l.email === m.email);
    const used         = memberLeaves.length;
    const usedInRange  = memberLeaves.filter(l => {
      const d = l.created_at ? l.created_at.slice(0, 10) : '';
      return d >= from && d <= to;
    }).length;
    const adjustments  = adjs.filter(a => a.user_id === m.id).reduce((s, a) => s + a.amount, 0);
    const { grantsEarned, balance } = computeBalance({ hireYear, currentYear: year, used, adjustments });
    return { name: m.name, email: m.email, entitled: grantsEarned, used, remaining: balance, usedInRange };
  });

  return { from, to, members: result };
}
```

Update `module.exports`:

```js
module.exports = { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData };
```

- [ ] **Step 4: Add `/leave` route to `routes/reports.js`**

Update the require at the top of the file:

```js
const { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData } = require('../lib/reportData');
```

Add route before `module.exports`:

```js
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
```

- [ ] **Step 5: Run leave tests — verify all pass**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /leave" 2>&1 | tail -10
```

Expected: 6 tests green.

- [ ] **Step 6: Run full suite — no regressions**

```bash
npx jest tests/reports.test.js --no-coverage 2>&1 | tail -5
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/reportData.js routes/reports.js tests/reports.test.js
git commit -m "feat: GET /reports/leave — leave utilization per member"
```

---

### Task 4: `fetchDisciplineData` + `GET /reports/discipline`

**Files:**
- Modify: `lib/reportData.js` (add `fetchDisciplineData`)
- Modify: `routes/reports.js` (add `/discipline` route)
- Modify: `tests/reports.test.js` (add GET /discipline tests)

- [ ] **Step 1: Add failing tests — append to `tests/reports.test.js`**

```js
/* ─── GET /discipline ─── */
describe('GET /discipline', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/discipline');
    expect(res.status).toBe(403);
  });

  test('400 when dates malformed', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/discipline?from=bad&to=2026-05-27');
    expect(res.status).toBe(400);
  });

  test('200 — returns per-member warning counts', async () => {
    const VOIDED_REC = { ...DISC_REC, voided: true };
    supabase.from.mockReturnValueOnce(c([MEMBER]));              // users
    supabase.from.mockReturnValueOnce(c([DISC_REC, VOIDED_REC])); // discipline_records
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].total).toBe(2);
    expect(res.body.members[0].active).toBe(1);
    expect(res.body.members[0].voided).toBe(1);
    expect(res.body.members[0].issuedInRange).toBe(2);
  });

  test('200 — issuedInRange is 0 when all records outside range', async () => {
    const OLD_REC = { ...DISC_REC, issued_at: '2025-01-01T00:00:00Z' };
    supabase.from.mockReturnValueOnce(c([MEMBER]));    // users
    supabase.from.mockReturnValueOnce(c([OLD_REC]));   // discipline_records
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.members[0].total).toBe(1);
    expect(res.body.members[0].issuedInRange).toBe(0);
  });

  test('500 when DB error on users query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });

  test('500 when DB error on discipline_records query', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /discipline" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Add `fetchDisciplineData` to `lib/reportData.js`**

Add after `fetchLeaveData`:

```js
async function fetchDisciplineData(from, to) {
  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('status', 'Active')
    .neq('role', 'owner');
  if (membersErr) throw new Error(membersErr.message);

  const { data: allRecords, error: recErr } = await supabase
    .from('discipline_records')
    .select('user_id, voided, issued_at');
  if (recErr) throw new Error(recErr.message);

  const records = allRecords || [];

  const result = (members || []).map(m => {
    const memberRecs = records.filter(r => r.user_id === m.id);
    const total      = memberRecs.length;
    const active     = memberRecs.filter(r => !r.voided).length;
    const voided     = memberRecs.filter(r => r.voided).length;
    const issuedInRange = memberRecs.filter(r => {
      const d = r.issued_at ? r.issued_at.slice(0, 10) : '';
      return d >= from && d <= to;
    }).length;
    return { name: m.name, email: m.email, total, active, voided, issuedInRange };
  });

  return { from, to, members: result };
}
```

Update `module.exports`:

```js
module.exports = { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData, fetchDisciplineData };
```

- [ ] **Step 4: Add `/discipline` route to `routes/reports.js`**

Update the require at the top:

```js
const { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData, fetchDisciplineData } = require('../lib/reportData');
```

Add route:

```js
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
```

- [ ] **Step 5: Run tests — all pass**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /discipline" 2>&1 | tail -10
```

Expected: 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add lib/reportData.js routes/reports.js tests/reports.test.js
git commit -m "feat: GET /reports/discipline — warning counts per member"
```

---

### Task 5: `fetchAttentionData` + `GET /reports/attention`

**Files:**
- Modify: `lib/reportData.js` (add `fetchAttentionData`)
- Modify: `routes/reports.js` (add `/attention` route)
- Modify: `tests/reports.test.js` (add GET /attention tests)

- [ ] **Step 1: Add failing tests — append to `tests/reports.test.js`**

```js
/* ─── GET /attention ─── */
describe('GET /attention', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/attention');
    expect(res.status).toBe(403);
  });

  test('200 — member with 2+ tardies appears with correct reason', async () => {
    const ATT2 = { ...ATT_ROW, date: '2026-05-11', late_status: 'MAJOR TARDY' };
    supabase.from.mockReturnValueOnce(c([MEMBER]));          // users
    supabase.from.mockReturnValueOnce(c([ATT_ROW, ATT2]));   // attendance
    supabase.from.mockReturnValueOnce(c([]));                 // discipline_records
    const res = await request(makeApp('admin', 'admin@test.com')).get('/attention');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].reasons).toContain('2+ tardies this month');
  });

  test('200 — member with active warning appears with correct reason', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));      // users
    supabase.from.mockReturnValueOnce(c([]));             // attendance
    supabase.from.mockReturnValueOnce(c([DISC_REC]));    // discipline_records
    const res = await request(makeApp('admin', 'admin@test.com')).get('/attention');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].reasons).toContain('Active warning');
  });

  test('200 — member with both triggers shows both reasons', async () => {
    const ATT2 = { ...ATT_ROW, date: '2026-05-11' };
    supabase.from.mockReturnValueOnce(c([MEMBER]));          // users
    supabase.from.mockReturnValueOnce(c([ATT_ROW, ATT2]));   // attendance
    supabase.from.mockReturnValueOnce(c([DISC_REC]));         // discipline_records
    const res = await request(makeApp('admin', 'admin@test.com')).get('/attention');
    expect(res.status).toBe(200);
    expect(res.body.members[0].reasons).toHaveLength(2);
  });

  test('200 — returns empty list when no one needs attention', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));  // users
    supabase.from.mockReturnValueOnce(c([]));         // attendance
    supabase.from.mockReturnValueOnce(c([]));         // discipline_records
    const res = await request(makeApp('admin', 'admin@test.com')).get('/attention');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(0);
  });

  test('500 when DB error on users query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com')).get('/attention');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /attention" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Add `fetchAttentionData` to `lib/reportData.js`**

Add after `fetchDisciplineData`:

```js
async function fetchAttentionData() {
  const now = new Date();
  const y   = now.getFullYear();
  const mo  = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  const from = `${y}-${mo}-01`;
  const to   = `${y}-${mo}-${d}`;

  const TARDY_STATUSES = new Set(['MINOR TARDY', 'MAJOR TARDY', 'AWOL HALF DAY', 'AWOL FULL DAY']);

  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('status', 'Active')
    .neq('role', 'owner');
  if (membersErr) throw new Error(membersErr.message);

  const { data: attendance, error: attErr } = await supabase
    .from('attendance')
    .select('email, late_status')
    .gte('date', from)
    .lte('date', to);
  if (attErr) throw new Error(attErr.message);

  const { data: allRecords, error: recErr } = await supabase
    .from('discipline_records')
    .select('user_id, voided');
  if (recErr) throw new Error(recErr.message);

  const attRows = attendance || [];
  const records = allRecords || [];
  const result  = [];

  for (const m of (members || [])) {
    const reasons    = [];
    const tardyCount = attRows.filter(r => r.email === m.email && TARDY_STATUSES.has(r.late_status)).length;
    if (tardyCount >= 2) reasons.push('2+ tardies this month');
    if (records.some(r => r.user_id === m.id && !r.voided)) reasons.push('Active warning');
    if (reasons.length > 0) result.push({ name: m.name, email: m.email, reasons });
  }

  return { members: result };
}
```

Update `module.exports`:

```js
module.exports = { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData, fetchDisciplineData, fetchAttentionData };
```

- [ ] **Step 4: Add `/attention` route to `routes/reports.js`**

Update the require at the top:

```js
const { parseDateRange, validateDateRange, fetchTardyData, fetchLeaveData, fetchDisciplineData, fetchAttentionData } = require('../lib/reportData');
```

Add route:

```js
router.get('/attention', requireRole('owner', 'admin'), async (req, res) => {
  try {
    return res.json(await fetchAttentionData());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Run tests — all pass**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /attention" 2>&1 | tail -10
```

Expected: 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add lib/reportData.js routes/reports.js tests/reports.test.js
git commit -m "feat: GET /reports/attention — who needs attention widget"
```

---

### Task 6: `GET /reports/deductions` placeholder

**Files:**
- Modify: `routes/reports.js` (add `/deductions` route)
- Modify: `tests/reports.test.js` (add GET /deductions tests)

- [ ] **Step 1: Add failing tests — append to `tests/reports.test.js`**

```js
/* ─── GET /deductions ─── */
describe('GET /deductions', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/deductions');
    expect(res.status).toBe(403);
  });

  test('200 — returns placeholder shape', async () => {
    const res = await request(makeApp('admin', 'admin@test.com')).get('/deductions');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Phase 6/i);
    expect(res.body.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /deductions" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Add `/deductions` route to `routes/reports.js`**

```js
router.get('/deductions', requireRole('owner', 'admin'), (_req, res) => {
  return res.json({ message: 'Deduction reporting available after Phase 6.', data: [] });
});
```

- [ ] **Step 4: Run tests — pass**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="GET /deductions" 2>&1 | tail -10
```

Expected: 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add routes/reports.js tests/reports.test.js
git commit -m "feat: GET /reports/deductions — placeholder for Phase 6"
```

---

### Task 7: CSV exports

**Files:**
- Modify: `routes/reports.js` (add `csvEscape`, `toCsv` helpers + 3 CSV routes)
- Modify: `tests/reports.test.js` (add CSV export tests)

- [ ] **Step 1: Add failing tests — append to `tests/reports.test.js`**

```js
/* ─── CSV exports ─── */
describe('CSV exports', () => {
  test('403 for member on tardy CSV', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/export/tardy.csv?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(403);
  });

  test('400 when dates malformed on tardy CSV', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/tardy.csv?from=bad&to=2026-05-27');
    expect(res.status).toBe(400);
  });

  test('200 — tardy CSV has correct headers and member row', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([ATT_ROW]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/tardy.csv?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('tardy');
    expect(res.text).toContain('Name,Email,Country');
    expect(res.text).toContain('Ana Reyes');
  });

  test('200 — leave CSV has correct headers and member row', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([LEAVE_ROW]));
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/leave.csv?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Name,Email,Entitled');
    expect(res.text).toContain('Ana Reyes');
  });

  test('200 — discipline CSV has correct headers and member row', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([DISC_REC]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/discipline.csv?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Name,Email,Total Warnings');
    expect(res.text).toContain('Ana Reyes');
  });

  test('500 when DB error on tardy CSV', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/tardy.csv?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="CSV exports" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Add CSV helpers and routes to `routes/reports.js`**

Add these helpers at the top of the file (after the requires):

```js
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
}
```

Add these three routes before `module.exports`:

```js
router.get('/export/tardy.csv', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  try {
    const { members } = await fetchTardyData(from, to);
    const csv = toCsv(
      ['Name', 'Email', 'Country', 'Minor', 'Major', 'AWOL Half', 'AWOL Full', 'Total'],
      members.map(m => [m.name, m.email, m.country, m.minor, m.major, m.awolHalf, m.awolFull, m.total])
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tardy-${from}-to-${to}.csv"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/export/leave.csv', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  try {
    const { members } = await fetchLeaveData(from, to);
    const csv = toCsv(
      ['Name', 'Email', 'Entitled', 'Used', 'Remaining', 'Used In Range'],
      members.map(m => [m.name, m.email, m.entitled, m.used, m.remaining, m.usedInRange])
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leave-${from}-to-${to}.csv"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/export/discipline.csv', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  try {
    const { members } = await fetchDisciplineData(from, to);
    const csv = toCsv(
      ['Name', 'Email', 'Total Warnings', 'Active', 'Voided', 'Issued In Range'],
      members.map(m => [m.name, m.email, m.total, m.active, m.voided, m.issuedInRange])
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="discipline-${from}-to-${to}.csv"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Run CSV tests — all pass**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="CSV exports" 2>&1 | tail -10
```

Expected: 7 tests green.

- [ ] **Step 5: Run full suite — no regressions**

```bash
npx jest tests/reports.test.js --no-coverage 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add routes/reports.js tests/reports.test.js
git commit -m "feat: CSV exports for tardy, leave, and discipline reports"
```

---

### Task 8: PDF exports

**Files:**
- Modify: `routes/reports.js` (add `buildPdf` helper + 3 PDF routes)
- Modify: `tests/reports.test.js` (add PDF export tests)

- [ ] **Step 1: Add failing tests — append to `tests/reports.test.js`**

```js
/* ─── PDF exports ─── */
describe('PDF exports', () => {
  test('403 for member on tardy PDF', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/export/tardy.pdf?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(403);
  });

  test('400 when dates malformed on tardy PDF', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/tardy.pdf?from=bad&to=2026-05-27');
    expect(res.status).toBe(400);
  });

  test('200 — tardy PDF has correct content-type and disposition', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([ATT_ROW]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/tardy.pdf?from=2026-05-01&to=2026-05-27')
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toContain('tardy');
  });

  test('200 — leave PDF has correct content-type', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([LEAVE_ROW]));
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/leave.pdf?from=2026-05-01&to=2026-05-27')
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('200 — discipline PDF has correct content-type', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([DISC_REC]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/discipline.pdf?from=2026-05-01&to=2026-05-27')
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('500 when DB error on tardy PDF', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/export/tardy.pdf?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="PDF exports" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Add `buildPdf` helper and PDF routes to `routes/reports.js`**

Add at the top of the file (after the existing requires):

```js
const PDFDocument = require('pdfkit');
```

Add `buildPdf` helper after the `toCsv` function:

```js
function buildPdf(res, { filename, title, subtitle, headers, rows }) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.fontSize(16).text(title, { underline: true });
  doc.fontSize(10).fillColor('#555555').text(subtitle);
  doc.fillColor('#000000').moveDown();
  doc.fontSize(9).font('Helvetica-Bold').text(headers.join('  |  '));
  doc.font('Helvetica');
  for (const row of rows) {
    doc.text(row.map(c => String(c == null ? '' : c)).join('  |  '));
  }
  doc.end();
}
```

Add the three PDF routes before `module.exports`:

```js
router.get('/export/tardy.pdf', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  try {
    const { members } = await fetchTardyData(from, to);
    buildPdf(res, {
      filename: `tardy-${from}-to-${to}.pdf`,
      title: 'Tardy Report',
      subtitle: `${from} to ${to}`,
      headers: ['Name', 'Email', 'Country', 'Minor', 'Major', 'AWOL Half', 'AWOL Full', 'Total'],
      rows: members.map(m => [m.name, m.email, m.country, m.minor, m.major, m.awolHalf, m.awolFull, m.total]),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/export/leave.pdf', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  try {
    const { members } = await fetchLeaveData(from, to);
    buildPdf(res, {
      filename: `leave-${from}-to-${to}.pdf`,
      title: 'Leave Utilization Report',
      subtitle: `${from} to ${to}`,
      headers: ['Name', 'Email', 'Entitled', 'Used', 'Remaining', 'Used In Range'],
      rows: members.map(m => [m.name, m.email, m.entitled, m.used, m.remaining, m.usedInRange]),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/export/discipline.pdf', requireRole('owner', 'admin'), async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  if (!validateDateRange(from, to)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  try {
    const { members } = await fetchDisciplineData(from, to);
    buildPdf(res, {
      filename: `discipline-${from}-to-${to}.pdf`,
      title: 'Discipline Report',
      subtitle: `${from} to ${to}`,
      headers: ['Name', 'Email', 'Total', 'Active', 'Voided', 'Issued In Range'],
      rows: members.map(m => [m.name, m.email, m.total, m.active, m.voided, m.issuedInRange]),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Run PDF tests — all pass**

```bash
npx jest tests/reports.test.js --no-coverage --testNamePattern="PDF exports" 2>&1 | tail -10
```

Expected: 6 tests green.

- [ ] **Step 5: Run full suite — no regressions**

```bash
npx jest tests/reports.test.js --no-coverage 2>&1 | tail -5
```

Expected: All tests pass (target: ~40 tests).

- [ ] **Step 6: Commit**

```bash
git add routes/reports.js tests/reports.test.js
git commit -m "feat: PDF exports for tardy, leave, and discipline reports"
```

---

### Task 9: Wire `server.js` + full regression

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the reports router to `server.js`**

Open `server.js`. Find this line:

```js
app.use('/appeals',    require('./routes/appeals'));
```

Add immediately after it:

```js
app.use('/reports',   require('./routes/reports'));
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /home/erwindev/Attendance && npx jest --no-coverage 2>&1 | tail -15
```

Expected: All tests pass (315 existing + ~40 new = ~355 total). Zero failures.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: mount /reports router in server.js — Phase 9A complete"
```
