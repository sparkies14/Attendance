# Milestone C — Attendance Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated AWOL detection (18:00 JST cron), per-country rolling 30-working-day tardy counters, owner-configurable thresholds, a Tardy Report tab in admin.html, and a self-view card in member.html.

**Architecture:** A `node-cron` job inside the Express process inserts `AWOL FULL DAY` attendance records at 18:00 JST on weekdays. Tardy counts are computed on request from existing `attendance` rows using two pure library modules (`lib/tardyCounter.js`, `lib/policyConfig.js`). Three new route files handle admin CRUD. Three new SQL migrations extend the schema. Three new tabs are added to `admin.html`; a card is added to `member.html`.

**Tech Stack:** Node.js 18+, Express 4, Supabase JS v2, node-cron 3, Jest 29

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `node-cron ^3.0.3` |
| `migrations/006_add_country_to_users.sql` | Create | ALTER TABLE users ADD COLUMN country |
| `migrations/007_create_holidays.sql` | Create | CREATE TABLE holidays |
| `migrations/008_create_policy_config.sql` | Create | CREATE TABLE policy_config + seed rows |
| `lib/policyConfig.js` | Create | `getThresholds()`, `isOverThreshold()` |
| `lib/tardyCounter.js` | Create | `countTardiness()` |
| `lib/cron.js` | Create | `runAwolCheck()` + `registerCron()` |
| `routes/adminHolidays.js` | Create | GET/POST/DELETE `/admin/holidays` |
| `routes/adminPolicyConfig.js` | Create | GET/PATCH `/admin/policy-config` |
| `routes/adminTardy.js` | Create | GET `/admin/tardy-report`, GET `/admin/tardy-summary`, POST `/admin/run-awol-check` |
| `routes/users.js` | Modify | Add PATCH `/:id` for `country` field |
| `server.js` | Modify | Import `registerCron`, mount 3 new routers |
| `tests/policyConfig.test.js` | Create | Unit tests for `lib/policyConfig.js` |
| `tests/tardyCounter.test.js` | Create | Unit tests for `lib/tardyCounter.js` |
| `tests/cron.test.js` | Create | Unit tests for `runAwolCheck()` |
| `admin.html` | Modify | Add Tardy Report, Holidays, Policy Config tabs |
| `member.html` | Modify | Add tardy summary card + country picker |

---

## Task 1: Add dependency + SQL migrations

**Files:**
- Modify: `package.json`
- Create: `migrations/006_add_country_to_users.sql`
- Create: `migrations/007_create_holidays.sql`
- Create: `migrations/008_create_policy_config.sql`

- [ ] **Step 1: Add node-cron to package.json**

Open `package.json` and add to `"dependencies"`:
```json
"node-cron": "^3.0.3"
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: `node-cron` appears in `node_modules/` and `package-lock.json` is updated.

- [ ] **Step 3: Create migration 006**

Create `migrations/006_add_country_to_users.sql`:
```sql
-- Add country column to users (ISO 3166-1 alpha-2 code, e.g. 'PH', 'VN', 'JP')
alter table users add column if not exists country text default 'PH';
```

- [ ] **Step 4: Create migration 007**

Create `migrations/007_create_holidays.sql`:
```sql
create table if not exists holidays (
  id      uuid primary key default gen_random_uuid(),
  date    date not null,
  name    text not null,
  country text not null
);
create unique index if not exists holidays_date_country on holidays(date, country);
```

- [ ] **Step 5: Create migration 008**

Create `migrations/008_create_policy_config.sql`:
```sql
create table if not exists policy_config (
  key   text primary key,
  value text not null
);

insert into policy_config (key, value) values
  ('threshold_minor_tardy', '3'),
  ('threshold_major_tardy', '2'),
  ('threshold_awol_half',   '1'),
  ('threshold_awol_full',   '1')
on conflict (key) do nothing;
```

- [ ] **Step 6: Run the migrations**

In Supabase SQL Editor, run each file in order: 006, 007, 008. Confirm no errors. (No automated step — operator runs these manually.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json migrations/006_add_country_to_users.sql migrations/007_create_holidays.sql migrations/008_create_policy_config.sql
git commit -m "feat: add node-cron dependency and Milestone C SQL migrations"
```

---

## Task 2: `lib/policyConfig.js` (TDD)

**Files:**
- Create: `tests/policyConfig.test.js`
- Create: `lib/policyConfig.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/policyConfig.test.js`:
```js
const mockSelect = jest.fn();
jest.mock('../lib/supabase', () => ({
  from: jest.fn(() => ({ select: mockSelect })),
}));

const supabase = require('../lib/supabase');
const { getThresholds, isOverThreshold } = require('../lib/policyConfig');

beforeEach(() => {
  supabase.from.mockClear();
  mockSelect.mockClear();
});

describe('getThresholds', () => {
  test('returns parsed integer thresholds from DB', async () => {
    mockSelect.mockResolvedValueOnce({
      data: [
        { key: 'threshold_minor_tardy', value: '3' },
        { key: 'threshold_major_tardy', value: '2' },
        { key: 'threshold_awol_half',   value: '1' },
        { key: 'threshold_awol_full',   value: '1' },
      ],
      error: null,
    });
    const t = await getThresholds();
    expect(t).toEqual({ minor: 3, major: 2, awolHalf: 1, awolFull: 1 });
  });

  test('falls back to defaults when a key is missing', async () => {
    mockSelect.mockResolvedValueOnce({ data: [], error: null });
    const t = await getThresholds();
    expect(t).toEqual({ minor: 3, major: 2, awolHalf: 1, awolFull: 1 });
  });

  test('throws when supabase returns an error', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    await expect(getThresholds()).rejects.toThrow('DB error');
  });
});

describe('isOverThreshold', () => {
  const thresholds = { minor: 3, major: 2, awolHalf: 1, awolFull: 1 };

  test('returns exceeded=false when all counts are below threshold', () => {
    const result = isOverThreshold({ minor: 2, major: 1, awolHalf: 0, awolFull: 0 }, thresholds);
    expect(result.exceeded).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  test('returns exceeded=true and reason for minor tardy at threshold', () => {
    const result = isOverThreshold({ minor: 3, major: 0, awolHalf: 0, awolFull: 0 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toContain('3 minor tardies (limit: 3)');
  });

  test('returns exceeded=true and reason for major tardy at threshold', () => {
    const result = isOverThreshold({ minor: 0, major: 2, awolHalf: 0, awolFull: 0 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toContain('2 major tardies (limit: 2)');
  });

  test('returns exceeded=true and reason for awolHalf at threshold', () => {
    const result = isOverThreshold({ minor: 0, major: 0, awolHalf: 1, awolFull: 0 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toContain('1 AWOL half days (limit: 1)');
  });

  test('returns exceeded=true and reason for awolFull at threshold', () => {
    const result = isOverThreshold({ minor: 0, major: 0, awolHalf: 0, awolFull: 1 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toContain('1 AWOL full days (limit: 1)');
  });

  test('reports all crossed thresholds, not just the first', () => {
    const result = isOverThreshold({ minor: 3, major: 2, awolHalf: 1, awolFull: 1 }, thresholds);
    expect(result.exceeded).toBe(true);
    expect(result.reasons).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/policyConfig.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../lib/policyConfig'`

- [ ] **Step 3: Implement `lib/policyConfig.js`**

Create `lib/policyConfig.js`:
```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/policyConfig.test.js --no-coverage
```

Expected: PASS — 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/policyConfig.js tests/policyConfig.test.js
git commit -m "feat: add lib/policyConfig with getThresholds and isOverThreshold (TDD)"
```

---

## Task 3: `lib/tardyCounter.js` (TDD)

**Files:**
- Create: `tests/tardyCounter.test.js`
- Create: `lib/tardyCounter.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/tardyCounter.test.js`:
```js
const { countTardiness } = require('../lib/tardyCounter');

// Fixed reference date: Wednesday 2026-05-27
const REF = new Date('2026-05-27T00:00:00.000Z');

function makeRow(date, late_status) {
  return { date, late_status };
}

describe('countTardiness — window calculation', () => {
  test('returns all zeros for empty attendance rows', () => {
    const result = countTardiness([], [], 30, REF);
    expect(result).toEqual({ minor: 0, major: 0, awolHalf: 0, awolFull: 0, workingDaysInWindow: 30 });
  });

  test('workingDaysInWindow is exactly 30', () => {
    const { workingDaysInWindow } = countTardiness([], [], 30, REF);
    expect(workingDaysInWindow).toBe(30);
  });

  test('skips Saturday attendance rows (weekend)', () => {
    // 2026-05-23 is a Saturday — should not be counted even if in the ~45-day calendar window
    const rows = [makeRow('2026-05-23', 'MINOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.minor).toBe(0);
  });

  test('skips Sunday attendance rows (weekend)', () => {
    const rows = [makeRow('2026-05-24', 'MAJOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.major).toBe(0);
  });

  test('skips rows on country holidays', () => {
    // 2026-05-26 is a Tuesday (working day) but we mark it as a holiday
    const holidays = ['2026-05-26'];
    const rows = [makeRow('2026-05-26', 'MINOR TARDY')];
    const result = countTardiness(rows, holidays, 30, REF);
    expect(result.minor).toBe(0);
  });

  test('counts rows on non-holiday weekdays', () => {
    // 2026-05-27 is Wednesday (REF itself) and a working day
    const rows = [makeRow('2026-05-27', 'MINOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.minor).toBe(1);
  });

  test('skips rows outside the 30-working-day window', () => {
    // Date well before the window (90 calendar days back)
    const rows = [makeRow('2026-03-01', 'MAJOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.major).toBe(0);
  });
});

describe('countTardiness — late_status mapping', () => {
  test('counts MINOR TARDY correctly', () => {
    const rows = [makeRow('2026-05-27', 'MINOR TARDY'), makeRow('2026-05-26', 'MINOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.minor).toBe(2);
    expect(result.major).toBe(0);
    expect(result.awolHalf).toBe(0);
    expect(result.awolFull).toBe(0);
  });

  test('counts MAJOR TARDY correctly', () => {
    const rows = [makeRow('2026-05-27', 'MAJOR TARDY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.major).toBe(1);
  });

  test('counts AWOL HALF DAY correctly', () => {
    const rows = [makeRow('2026-05-27', 'AWOL HALF DAY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.awolHalf).toBe(1);
  });

  test('counts AWOL FULL DAY correctly', () => {
    const rows = [makeRow('2026-05-27', 'AWOL FULL DAY')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.awolFull).toBe(1);
  });

  test('ignores ON TIME and other late_status values', () => {
    const rows = [makeRow('2026-05-27', 'ON TIME'), makeRow('2026-05-26', '')];
    const result = countTardiness(rows, [], 30, REF);
    expect(result.minor).toBe(0);
    expect(result.major).toBe(0);
    expect(result.awolHalf).toBe(0);
    expect(result.awolFull).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/tardyCounter.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../lib/tardyCounter'`

- [ ] **Step 3: Implement `lib/tardyCounter.js`**

Create `lib/tardyCounter.js`:
```js
function buildWorkingDaySet(referenceDate, windowDays, holidays) {
  const holidaySet = new Set(holidays);
  const workingDays = [];
  const cursor = new Date(referenceDate);

  while (workingDays.length < windowDays) {
    const day = cursor.getDay(); // 0=Sun, 6=Sat
    const dateStr = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
      workingDays.unshift(dateStr);
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return new Set(workingDays);
}

function countTardiness(attendanceRows, holidays, windowDays = 30, referenceDate = new Date()) {
  const workingDaySet = buildWorkingDaySet(referenceDate, windowDays, holidays);
  let minor = 0, major = 0, awolHalf = 0, awolFull = 0;

  for (const row of attendanceRows) {
    if (!workingDaySet.has(row.date)) continue;
    if      (row.late_status === 'MINOR TARDY')    minor++;
    else if (row.late_status === 'MAJOR TARDY')    major++;
    else if (row.late_status === 'AWOL HALF DAY')  awolHalf++;
    else if (row.late_status === 'AWOL FULL DAY')  awolFull++;
  }

  return { minor, major, awolHalf, awolFull, workingDaysInWindow: workingDaySet.size };
}

module.exports = { countTardiness };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/tardyCounter.test.js --no-coverage
```

Expected: PASS — 13 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/tardyCounter.js tests/tardyCounter.test.js
git commit -m "feat: add lib/tardyCounter with countTardiness (TDD)"
```

---

## Task 4: `lib/cron.js` (TDD)

**Files:**
- Create: `tests/cron.test.js`
- Create: `lib/cron.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/cron.test.js`:
```js
const mockMembersSelect = jest.fn();
const mockAttSelect     = jest.fn();
const mockInsert        = jest.fn();

jest.mock('../lib/supabase', () => {
  const chain = {};
  chain.select    = jest.fn(() => chain);
  chain.eq        = jest.fn(() => chain);
  chain.maybeSingle = jest.fn();
  chain.insert    = mockInsert;

  return {
    from: jest.fn(table => {
      if (table === 'users')      return { select: mockMembersSelect };
      if (table === 'attendance') return { select: mockAttSelect, insert: mockInsert };
      return chain;
    }),
  };
});

const supabase = require('../lib/supabase');
const { runAwolCheck } = require('../lib/cron');

const ACTIVE_MEMBERS = [
  { email: 'ana@test.com', name: 'Ana', role: 'member', job_role: 'Developer' },
  { email: 'bob@test.com', name: 'Bob', role: 'member', job_role: null },
];

function makeMembersChain(members) {
  const chain = { eq: jest.fn() };
  chain.eq.mockImplementationOnce(() => chain);
  chain.eq.mockImplementationOnce(() => Promise.resolve({ data: members, error: null }));
  mockMembersSelect.mockReturnValueOnce(chain);
}

function makeAttChain(existingRow) {
  const chain = { eq: jest.fn(), maybeSingle: jest.fn() };
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data: existingRow, error: null });
  mockAttSelect.mockReturnValueOnce(chain);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
});

describe('runAwolCheck', () => {
  test('inserts AWOL FULL DAY record for member with no attendance row', async () => {
    makeMembersChain(ACTIVE_MEMBERS.slice(0, 1)); // one member: Ana
    makeAttChain(null); // no existing row

    const result = await runAwolCheck('2026-05-27');

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@test.com',
      name: 'Ana',
      date: '2026-05-27',
      status: 'Approved',
      late_status: 'AWOL FULL DAY',
      entry_type: 'auto',
    }));
  });

  test('skips member who already has an attendance row for the date', async () => {
    makeMembersChain(ACTIVE_MEMBERS.slice(0, 1));
    makeAttChain({ id: 'existing-row-id' }); // row exists

    const result = await runAwolCheck('2026-05-27');

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('processes multiple members independently', async () => {
    makeMembersChain(ACTIVE_MEMBERS); // Ana + Bob
    makeAttChain({ id: 'exists' }); // Ana has a row
    makeAttChain(null);              // Bob does not

    const result = await runAwolCheck('2026-05-27');

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  test('uses job_role for the role field when available', async () => {
    makeMembersChain([{ email: 'ana@test.com', name: 'Ana', role: 'member', job_role: 'Developer' }]);
    makeAttChain(null);

    await runAwolCheck('2026-05-27');

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ role: 'Developer' }));
  });

  test('falls back to users.role when job_role is null', async () => {
    makeMembersChain([{ email: 'bob@test.com', name: 'Bob', role: 'member', job_role: null }]);
    makeAttChain(null);

    await runAwolCheck('2026-05-27');

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ role: 'member' }));
  });

  test('returns the date used in the result', async () => {
    makeMembersChain([]);
    const result = await runAwolCheck('2026-06-01');
    expect(result.date).toBe('2026-06-01');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/cron.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../lib/cron'`

- [ ] **Step 3: Implement `lib/cron.js`**

Create `lib/cron.js`:
```js
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
}

module.exports = { runAwolCheck, registerCron };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/cron.test.js --no-coverage
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass (rules, auth, middleware, audit, policyConfig, tardyCounter, cron).

- [ ] **Step 6: Commit**

```bash
git add lib/cron.js tests/cron.test.js
git commit -m "feat: add lib/cron with runAwolCheck + node-cron registration (TDD)"
```

---

## Task 5: `routes/adminHolidays.js`

**Files:**
- Create: `routes/adminHolidays.js`

- [ ] **Step 1: Create the route file**

Create `routes/adminHolidays.js`:
```js
const router     = require('express').Router();
const supabase   = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  let query = supabase.from('holidays').select('*').order('date', { ascending: true });
  if (req.query.country) query = query.eq('country', req.query.country);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ holidays: data || [] });
});

router.post('/', requireRole('owner'), async (req, res) => {
  const { date, name, country } = req.body || {};
  if (!date || !name || !country) {
    return res.status(400).json({ error: 'date, name, and country are required.' });
  }
  const { data, error } = await supabase
    .from('holidays')
    .insert({ date, name, country })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ holiday: data });
});

router.delete('/:id', requireRole('owner'), async (req, res) => {
  const { error } = await supabase.from('holidays').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add routes/adminHolidays.js
git commit -m "feat: add GET/POST/DELETE /admin/holidays route"
```

---

## Task 6: `routes/adminPolicyConfig.js`

**Files:**
- Create: `routes/adminPolicyConfig.js`

- [ ] **Step 1: Create the route file**

Create `routes/adminPolicyConfig.js`:
```js
const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const ALLOWED_KEYS = [
  'threshold_minor_tardy',
  'threshold_major_tardy',
  'threshold_awol_half',
  'threshold_awol_full',
];

router.use(requireAuth);

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  const config = {};
  for (const row of data || []) config[row.key] = parseInt(row.value, 10);
  return res.json({ config });
});

router.patch('/', requireRole('owner'), async (req, res) => {
  const updates = req.body || {};
  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: `Unknown config key: ${key}` });
    }
    const num = parseInt(value, 10);
    if (!Number.isInteger(num) || num < 1) {
      return res.status(400).json({ error: `${key} must be a positive integer.` });
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    const { error } = await supabase
      .from('policy_config')
      .update({ value: String(parseInt(value, 10)) })
      .eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
  }
  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  const config = {};
  for (const row of data || []) config[row.key] = parseInt(row.value, 10);
  return res.json({ config });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add routes/adminPolicyConfig.js
git commit -m "feat: add GET/PATCH /admin/policy-config route"
```

---

## Task 7: `routes/adminTardy.js`

**Files:**
- Create: `routes/adminTardy.js`

- [ ] **Step 1: Create the route file**

Create `routes/adminTardy.js`:
```js
const router            = require('express').Router();
const supabase          = require('../lib/supabase');
const requireAuth       = require('../middleware/requireAuth');
const requireRole       = require('../middleware/requireRole');
const { countTardiness }              = require('../lib/tardyCounter');
const { getThresholds, isOverThreshold } = require('../lib/policyConfig');
const { runAwolCheck }                = require('../lib/cron');

router.use(requireAuth);

// Fetch attendance rows from the last 45 calendar days — generous enough
// to always contain 30 working days regardless of holiday density.
function windowStart() {
  const d = new Date();
  d.setDate(d.getDate() - 45);
  return d.toISOString().slice(0, 10);
}

router.get('/tardy-report', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const thresholds = await getThresholds();

    const { data: members, error: membersError } = await supabase
      .from('users')
      .select('id, email, name, country, role, job_role')
      .eq('status', 'Active')
      .neq('role', 'owner');
    if (membersError) return res.status(500).json({ error: membersError.message });

    const { data: allHolidays } = await supabase.from('holidays').select('date, country');
    const start = windowStart();

    const result = [];
    for (const member of members || []) {
      const memberCountry  = member.country || 'PH';
      const memberHolidays = (allHolidays || [])
        .filter(h => h.country === memberCountry)
        .map(h => h.date);

      const { data: attendance } = await supabase
        .from('attendance')
        .select('date, late_status')
        .eq('email', member.email)
        .gte('date', start);

      const counts = countTardiness(attendance || [], memberHolidays);
      const { exceeded, reasons } = isOverThreshold(counts, thresholds);

      result.push({
        id: member.id, name: member.name, email: member.email, country: memberCountry,
        counts: { minor: counts.minor, major: counts.major, awolHalf: counts.awolHalf, awolFull: counts.awolFull },
        exceeded, reasons,
      });
    }

    result.sort((a, b) => (b.exceeded ? 1 : 0) - (a.exceeded ? 1 : 0) || a.name.localeCompare(b.name));
    return res.json({ thresholds, members: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/tardy-summary', async (req, res) => {
  try {
    const thresholds = await getThresholds();

    const { data: member, error: memberError } = await supabase
      .from('users')
      .select('id, email, name, country')
      .eq('id', req.user.user_id)
      .single();
    if (memberError) return res.status(500).json({ error: memberError.message });

    const memberCountry  = member.country || 'PH';
    const { data: allHolidays } = await supabase.from('holidays').select('date, country');
    const memberHolidays = (allHolidays || [])
      .filter(h => h.country === memberCountry)
      .map(h => h.date);

    const { data: attendance } = await supabase
      .from('attendance')
      .select('date, late_status')
      .eq('email', member.email)
      .gte('date', windowStart());

    const counts = countTardiness(attendance || [], memberHolidays);
    const { exceeded, reasons } = isOverThreshold(counts, thresholds);

    return res.json({
      id: member.id, name: member.name, email: member.email, country: memberCountry,
      counts: { minor: counts.minor, major: counts.major, awolHalf: counts.awolHalf, awolFull: counts.awolFull },
      exceeded, reasons,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/run-awol-check', requireRole('owner', 'admin'), async (req, res) => {
  const { date } = req.body || {};
  const result = await runAwolCheck(date || null);
  return res.json(result);
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add routes/adminTardy.js
git commit -m "feat: add /admin/tardy-report, /admin/tardy-summary, /admin/run-awol-check routes"
```

---

## Task 8: Extend `routes/users.js` — country field

**Files:**
- Modify: `routes/users.js`

- [ ] **Step 1: Add PATCH `/:id` to routes/users.js**

Open `routes/users.js`. After the last `router.post('/:id/deactivate', ...)` line and before `module.exports = router;`, add:

```js
router.patch('/:id', async (req, res) => {
  const id      = req.params.id;
  const { country } = req.body || {};

  const isSelf     = id === req.user.user_id;
  const isElevated = ['owner', 'admin'].includes(req.user.role);
  if (!isSelf && !isElevated) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  if (!country || typeof country !== 'string' || country.trim().length === 0 || country.length > 10) {
    return res.status(400).json({ error: 'country must be a non-empty string (ISO 3166-1 alpha-2 recommended, max 10 chars).' });
  }

  const { data, error } = await supabase
    .from('users')
    .update({ country: country.trim().toUpperCase() })
    .eq('id', id)
    .select('id, email, name, country')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, user: data });
});
```

- [ ] **Step 2: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests still pass (this change adds a route but doesn't break existing logic).

- [ ] **Step 3: Commit**

```bash
git add routes/users.js
git commit -m "feat: add PATCH /users/:id for country field (self or admin/owner)"
```

---

## Task 9: Wire `server.js` — mount routes + register cron

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add imports and mounts to server.js**

Open `server.js`. After the line `app.use('/audit', require('./routes/audit'));`, add:

```js
app.use('/admin', require('./routes/adminTardy'));
app.use('/admin', require('./routes/adminHolidays'));
app.use('/admin', require('./routes/adminPolicyConfig'));
app.use('/member', require('./routes/adminTardy'));
```

At the bottom of the file, after `app.listen(...)`, add:

```js
require('./lib/cron').registerCron();
```

The full bottom of `server.js` should now look like:

```js
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Attendance server running on http://localhost:${PORT}`));

require('./lib/cron').registerCron();
```

- [ ] **Step 2: Verify the server starts**

```bash
node server.js
```

Expected output includes:
```
Attendance server running on http://localhost:3000
AWOL cron registered: 18:00 JST weekdays
```

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: mount admin/member tardy routes and register AWOL cron in server.js"
```

---

## Task 10: `admin.html` — tab strip + Tardy Report tab

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Extend the tab strip**

In `admin.html`, find the tab strip div (around line 65):
```html
<div style="display:flex;gap:6px;margin-bottom:18px;background:#f5f5f3;padding:4px;border-radius:10px;width:fit-content;">
  <button type="button" id="tab-users" onclick="switchPage('users')" style="padding:8px 16px;border:none;background:white;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.06);">Users</button>
  <button type="button" id="tab-audit" onclick="switchPage('audit')" style="padding:8px 16px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);">Audit Log</button>
</div>
```

Replace it with:
```html
<div style="display:flex;gap:6px;margin-bottom:18px;background:#f5f5f3;padding:4px;border-radius:10px;width:fit-content;flex-wrap:wrap;">
  <button type="button" id="tab-users"    onclick="switchPage('users')"    style="padding:8px 16px;border:none;background:white;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.06);">Users</button>
  <button type="button" id="tab-audit"   onclick="switchPage('audit')"    style="padding:8px 16px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);">Audit Log</button>
  <button type="button" id="tab-tardy"   onclick="switchPage('tardy')"    style="padding:8px 16px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);">Tardy Report</button>
  <button type="button" id="tab-holidays" onclick="switchPage('holidays')" style="padding:8px 16px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);">Holidays</button>
  <button type="button" id="tab-policy"  onclick="switchPage('policy')"   style="padding:8px 16px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);">Policy Config</button>
</div>
```

- [ ] **Step 2: Add the Tardy Report page div**

Find the closing `</div>` that ends `<!-- ═════ AUDIT LOG PAGE ═════ -->` (around line 167). Immediately after it, add:

```html
  <!-- ═════ TARDY REPORT PAGE ═════ -->
  <div id="page-tardy" style="display:none;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--text2);" id="tardy-updated">—</span>
      <button class="btn" onclick="loadTardy()">↻ Refresh</button>
      <button class="btn btn-primary" id="btn-run-awol" onclick="runAwolCheck()" style="display:none;">Run AWOL Check</button>
    </div>
    <div class="card">
      <table id="tardy-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Country</th>
            <th>Minor</th>
            <th>Major</th>
            <th>AWOL ½</th>
            <th>AWOL ★</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="tardy-tbody">
          <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text2);">Click "Tardy Report" to load.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
```

- [ ] **Step 3: Update `switchPage` to handle all 5 tabs**

Find the `switchPage` function in `<script>` (around line 352). Replace it entirely with:

```js
const ALL_TABS = ['users', 'audit', 'tardy', 'holidays', 'policy'];
const TAB_TITLES = { users: 'User Management', audit: 'Audit Log', tardy: 'Tardy Report', holidays: 'Holidays', policy: 'Policy Config' };

function switchPage(name) {
  ALL_TABS.forEach(t => {
    const page = document.getElementById(`page-${t}`);
    const tab  = document.getElementById(`tab-${t}`);
    if (!page || !tab) return;
    const active = t === name;
    page.style.display   = active ? 'block' : 'none';
    tab.style.background  = active ? 'white' : 'transparent';
    tab.style.fontWeight  = active ? '600' : '500';
    tab.style.color       = active ? 'var(--text)' : 'var(--text2)';
    if (active) tab.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
    else        tab.style.boxShadow = 'none';
  });

  document.getElementById('page-h1').textContent = TAB_TITLES[name] || name;
  document.getElementById('btn-invite').style.display = name === 'users' ? '' : 'none';

  if (name === 'audit') {
    if (!auditState.loaded) loadAudit();
    refreshCleanButton();
    refreshExportStatus();
    document.getElementById('btn-clean').style.display = currentUser.role === 'owner' ? '' : 'none';
    document.getElementById('link-skip-export').style.display = currentUser.role === 'owner' ? '' : 'none';
  }
  if (name === 'tardy')    loadTardy();
  if (name === 'holidays') loadHolidays();
  if (name === 'policy')   loadPolicyConfig();
}
```

- [ ] **Step 4: Add Tardy Report JavaScript**

In the `<script>` block, before the closing `</script>`, add:

```js
async function loadTardy() {
  const tbody = document.getElementById('tardy-tbody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text2);">Loading…</td></tr>`;
  try {
    const res  = await apiFetch(`${API_BASE}/admin/tardy-report`);
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Failed to load tardy report.'); return; }
    renderTardy(data.members || [], data.thresholds);
    document.getElementById('tardy-updated').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    document.getElementById('btn-run-awol').style.display = ['owner','admin'].includes(currentUser.role) ? '' : 'none';
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}

function renderTardy(members, thresholds) {
  const tbody = document.getElementById('tardy-tbody');
  if (!members.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text2);">No active members.</td></tr>`;
    return;
  }
  tbody.innerHTML = members.map(m => {
    const statusHtml = m.exceeded
      ? `<span style="color:var(--amber);font-weight:600;" title="${escapeHtml(m.reasons.join(', '))}">⚠️ Exceeded</span>`
      : `<span style="color:var(--accent);font-weight:600;">✅ OK</span>`;
    const rowBg = m.exceeded ? 'background:#fff8ee;' : '';
    return `<tr style="${rowBg}">
      <td>${escapeHtml(m.name)}</td>
      <td style="color:var(--text2);">${escapeHtml(m.country)}</td>
      <td style="text-align:center;">${m.counts.minor}</td>
      <td style="text-align:center;">${m.counts.major}</td>
      <td style="text-align:center;">${m.counts.awolHalf}</td>
      <td style="text-align:center;">${m.counts.awolFull}</td>
      <td>${statusHtml}</td>
    </tr>`;
  }).join('');
}

async function runAwolCheck() {
  try {
    const res  = await apiFetch(`${API_BASE}/admin/run-awol-check`, { method: 'POST', body: JSON.stringify({}) });
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'AWOL check failed.'); return; }
    showStatus('success', `AWOL check for ${data.date}: ${data.inserted} inserted, ${data.skipped} skipped.`);
    loadTardy();
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat: add Tardy Report tab to admin.html"
```

---

## Task 11: `admin.html` — Holidays tab

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add the Holidays page div**

After the closing `</div>` of `<!-- ═════ TARDY REPORT PAGE ═════ -->`, add:

```html
  <!-- ═════ HOLIDAYS PAGE ═════ -->
  <div id="page-holidays" style="display:none;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <select id="holidays-country-filter" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;" onchange="loadHolidays()">
        <option value="">All countries</option>
        <option value="PH">🇵🇭 Philippines (PH)</option>
        <option value="VN">🇻🇳 Vietnam (VN)</option>
        <option value="JP">🇯🇵 Japan (JP)</option>
      </select>
      <button class="btn btn-primary" id="btn-add-holiday" onclick="openAddHoliday()" style="display:none;">+ Add Holiday</button>
    </div>
    <div class="card">
      <table id="holidays-table">
        <thead>
          <tr><th>Date</th><th>Name</th><th>Country</th><th>Actions</th></tr>
        </thead>
        <tbody id="holidays-tbody">
          <tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text2);">Click "Holidays" to load.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
```

Also add the Add Holiday modal before the closing `</div>` of the container (alongside the other modals):

```html
<div class="modal-bg" id="add-holiday-modal">
  <div class="modal">
    <h2>Add Holiday</h2>
    <label>Date</label>
    <input type="date" id="holiday-date">
    <label>Name</label>
    <input type="text" id="holiday-name" maxlength="80" placeholder="e.g. Independence Day">
    <label>Country</label>
    <select id="holiday-country">
      <option value="PH">🇵🇭 Philippines (PH)</option>
      <option value="VN">🇻🇳 Vietnam (VN)</option>
      <option value="JP">🇯🇵 Japan (JP)</option>
    </select>
    <div class="modal-actions">
      <button class="btn" onclick="closeAddHoliday()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddHoliday()">Add Holiday</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add Holidays JavaScript**

In the `<script>` block, before `</script>`, add:

```js
async function loadHolidays() {
  const tbody   = document.getElementById('holidays-tbody');
  const country = document.getElementById('holidays-country-filter').value;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text2);">Loading…</td></tr>`;

  document.getElementById('btn-add-holiday').style.display = currentUser.role === 'owner' ? '' : 'none';

  try {
    const params = country ? `?country=${encodeURIComponent(country)}` : '';
    const res    = await apiFetch(`${API_BASE}/admin/holidays${params}`);
    const data   = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Failed to load holidays.'); return; }
    renderHolidays(data.holidays || []);
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}

function renderHolidays(holidays) {
  const tbody = document.getElementById('holidays-tbody');
  if (!holidays.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text2);">No holidays yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = holidays.map(h => `
    <tr>
      <td>${escapeHtml(h.date)}</td>
      <td>${escapeHtml(h.name)}</td>
      <td style="color:var(--text2);">${escapeHtml(h.country)}</td>
      <td><div class="row-actions">
        ${currentUser.role === 'owner' ? `<button class="btn btn-danger" onclick="deleteHoliday('${h.id}')">Delete</button>` : '<span style="color:var(--text3);font-size:12px;">—</span>'}
      </div></td>
    </tr>`).join('');
}

function openAddHoliday() {
  document.getElementById('add-holiday-modal').classList.add('show');
}
function closeAddHoliday() {
  document.getElementById('add-holiday-modal').classList.remove('show');
  document.getElementById('holiday-date').value = '';
  document.getElementById('holiday-name').value = '';
  document.getElementById('holiday-country').value = 'PH';
}

async function submitAddHoliday() {
  const date    = document.getElementById('holiday-date').value;
  const name    = document.getElementById('holiday-name').value.trim();
  const country = document.getElementById('holiday-country').value;
  if (!date || !name) { showStatus('error', 'Date and name are required.'); return; }
  try {
    const res = await apiFetch(`${API_BASE}/admin/holidays`, {
      method: 'POST', body: JSON.stringify({ date, name, country }),
    });
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Failed to add holiday.'); return; }
    showStatus('success', `Added: ${name}`);
    closeAddHoliday();
    loadHolidays();
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}

async function deleteHoliday(id) {
  if (!confirm('Delete this holiday?')) return;
  try {
    const res = await apiFetch(`${API_BASE}/admin/holidays/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Failed to delete.'); return; }
    showStatus('success', 'Holiday deleted.');
    loadHolidays();
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: add Holidays tab to admin.html"
```

---

## Task 12: `admin.html` — Policy Config tab

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add the Policy Config page div**

After the closing `</div>` of `<!-- ═════ HOLIDAYS PAGE ═════ -->`, add:

```html
  <!-- ═════ POLICY CONFIG PAGE ═════ -->
  <div id="page-policy" style="display:none;">
    <div class="card" style="padding:24px;max-width:480px;">
      <p style="font-size:13px;color:var(--text2);margin-bottom:20px;">Thresholds apply to the rolling 30 working days window. Counts equal to or above the threshold trigger a warning badge.</p>

      <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Threshold — Minor Tardy</label>
      <input type="number" id="cfg-minor" min="1" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;margin-bottom:14px;">

      <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Threshold — Major Tardy</label>
      <input type="number" id="cfg-major" min="1" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;margin-bottom:14px;">

      <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Threshold — AWOL Half Day</label>
      <input type="number" id="cfg-awol-half" min="1" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;margin-bottom:14px;">

      <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Threshold — AWOL Full Day</label>
      <input type="number" id="cfg-awol-full" min="1" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;margin-bottom:20px;">

      <button class="btn btn-primary" id="btn-save-policy" onclick="savePolicyConfig()" style="display:none;">Save</button>
      <p id="policy-readonly-note" style="font-size:12px;color:var(--text3);display:none;">Only the owner can edit these thresholds.</p>
    </div>
  </div>
```

- [ ] **Step 2: Add Policy Config JavaScript**

In the `<script>` block, before `</script>`, add:

```js
async function loadPolicyConfig() {
  try {
    const res  = await apiFetch(`${API_BASE}/admin/policy-config`);
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Failed to load policy config.'); return; }
    const cfg = data.config || {};
    document.getElementById('cfg-minor').value     = cfg.threshold_minor_tardy ?? 3;
    document.getElementById('cfg-major').value     = cfg.threshold_major_tardy ?? 2;
    document.getElementById('cfg-awol-half').value = cfg.threshold_awol_half   ?? 1;
    document.getElementById('cfg-awol-full').value = cfg.threshold_awol_full   ?? 1;

    const isOwner = currentUser.role === 'owner';
    ['cfg-minor','cfg-major','cfg-awol-half','cfg-awol-full'].forEach(id => {
      document.getElementById(id).disabled = !isOwner;
    });
    document.getElementById('btn-save-policy').style.display      = isOwner ? '' : 'none';
    document.getElementById('policy-readonly-note').style.display = isOwner ? 'none' : 'block';
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}

async function savePolicyConfig() {
  const body = {
    threshold_minor_tardy: document.getElementById('cfg-minor').value,
    threshold_major_tardy: document.getElementById('cfg-major').value,
    threshold_awol_half:   document.getElementById('cfg-awol-half').value,
    threshold_awol_full:   document.getElementById('cfg-awol-full').value,
  };
  try {
    const res  = await apiFetch(`${API_BASE}/admin/policy-config`, { method: 'PATCH', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Save failed.'); return; }
    showStatus('success', 'Policy thresholds saved.');
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: add Policy Config tab to admin.html"
```

---

## Task 13: `member.html` — tardy summary card + country picker

**Files:**
- Modify: `member.html`

- [ ] **Step 1: Locate the insertion point in member.html**

Search for `id="leave-history-container"` in `member.html` (it's around line 752). The tardy card goes **immediately before** that div, so it appears between the monthly summary counts and the leave history table.

- [ ] **Step 2: Add the tardy summary card HTML**

Immediately before the `<div id="leave-history-container">` line, add:

```html
<!-- ── Tardy Summary Card ── -->
<div id="tardy-card" style="background:white;border:1px solid var(--border);border-radius:14px;padding:20px;margin-top:16px;max-width:440px;">
  <div style="font-weight:600;font-size:15px;margin-bottom:14px;">Attendance (last 30 working days)</div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:5px 0;color:var(--text2);">Minor Tardy</td>     <td id="tc-minor"     style="text-align:right;font-weight:500;">—</td></tr>
    <tr><td style="padding:5px 0;color:var(--text2);">Major Tardy</td>     <td id="tc-major"     style="text-align:right;font-weight:500;">—</td></tr>
    <tr><td style="padding:5px 0;color:var(--text2);">AWOL Half Day</td>   <td id="tc-awol-half" style="text-align:right;font-weight:500;">—</td></tr>
    <tr><td style="padding:5px 0;color:var(--text2);">AWOL Full Day</td>   <td id="tc-awol-full" style="text-align:right;font-weight:500;">—</td></tr>
    <tr style="border-top:1px solid var(--border);">
      <td style="padding:8px 0 0;color:var(--text2);">Status</td>
      <td id="tc-status" style="padding:8px 0 0;text-align:right;font-weight:600;">—</td>
    </tr>
  </table>
  <div style="margin-top:16px;font-size:13px;color:var(--text2);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
    Country: <span id="tc-country-label" style="font-weight:500;">—</span>
    <button class="btn" id="tc-country-btn" onclick="openCountryPicker()" style="padding:4px 10px;font-size:12px;">Change</button>
  </div>
  <div id="tc-country-picker" style="display:none;margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <select id="tc-country-select" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;">
      <option value="PH">🇵🇭 Philippines (PH)</option>
      <option value="VN">🇻🇳 Vietnam (VN)</option>
      <option value="JP">🇯🇵 Japan (JP)</option>
    </select>
    <button class="btn btn-primary" onclick="saveCountry()" style="font-size:12px;padding:8px 12px;">Save</button>
    <button class="btn" onclick="closeCountryPicker()" style="font-size:12px;padding:8px 12px;">Cancel</button>
  </div>
</div>
```

- [ ] **Step 3: Add tardy summary JavaScript to member.html**

Find the `<script>` block in `member.html`. Locate where the page initialises (look for a call to `loadData()` or similar on page load). After the existing init calls, add `loadTardySummary();`.

Then add these functions before the closing `</script>` tag:

```js
async function loadTardySummary() {
  try {
    const res  = await apiFetch('http://localhost:3000/admin/tardy-summary');
    const data = await res.json();
    if (!res.ok) return; // silent fail — card stays at defaults
    const c = data.counts || {};
    document.getElementById('tc-minor').textContent     = c.minor     ?? 0;
    document.getElementById('tc-major').textContent     = c.major     ?? 0;
    document.getElementById('tc-awol-half').textContent = c.awolHalf  ?? 0;
    document.getElementById('tc-awol-full').textContent = c.awolFull  ?? 0;

    const statusEl = document.getElementById('tc-status');
    if (data.exceeded) {
      statusEl.textContent = '⚠️ Policy Warning';
      statusEl.style.color = 'var(--amber)';
    } else {
      statusEl.textContent = '✅ On Track';
      statusEl.style.color = 'var(--accent)';
    }

    const country = data.country || 'PH';
    document.getElementById('tc-country-label').textContent = country;
    document.getElementById('tc-country-select').value      = country;
  } catch (e) { /* silent — tardy card is non-critical */ }
}

function openCountryPicker() {
  document.getElementById('tc-country-btn').style.display    = 'none';
  document.getElementById('tc-country-picker').style.display = 'flex';
}
function closeCountryPicker() {
  document.getElementById('tc-country-btn').style.display    = '';
  document.getElementById('tc-country-picker').style.display = 'none';
}

async function saveCountry() {
  const country = document.getElementById('tc-country-select').value;
  const userStr = sessionStorage.getItem('anosupo_user');
  if (!userStr) return;
  const user = JSON.parse(userStr);
  try {
    const res  = await apiFetch(`http://localhost:3000/users/${user.id}`, {
      method: 'PATCH', body: JSON.stringify({ country }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to update country.'); return; }
    document.getElementById('tc-country-label').textContent = country;
    closeCountryPicker();
    loadTardySummary();
  } catch (e) {
    alert('Connection failed.');
  }
}
```

- [ ] **Step 4: Verify the page calls `loadTardySummary()` on init**

Find the place in `member.html`'s `<script>` block where the app initialises data on load (look for a call to `loadData()`, or a DOMContentLoaded / window.onload handler). Add `loadTardySummary();` there so the card populates automatically when the member page opens.

- [ ] **Step 5: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add member.html
git commit -m "feat: add tardy summary card and country picker to member.html"
```

---

## Final verification

- [ ] **Start the server and smoke-test manually**

```bash
node server.js
```

1. Open `admin.html` and log in as owner
2. Click "Tardy Report" — table loads with all active members (may be all zeros)
3. Click "Holidays" — empty table; add one holiday (e.g., 2026-06-12 Independence Day PH); confirm it appears
4. Click "Policy Config" — inputs populated with defaults; change Minor Tardy to 2 and Save; confirm success toast
5. Click "Tardy Report" again — Refresh; member who has ≥2 minor tardies now shows ⚠️ badge
6. Open `member.html` — tardy summary card shows counts and country; "Change" opens picker; save a different country; card updates
7. Click "Run AWOL Check" (if it's after 18:00 JST, or use the button anytime as admin); check the toast for inserted/skipped count

- [ ] **Final commit if any last-minute fixes were made**

```bash
git add -A
git commit -m "fix: smoke-test adjustments for Milestone C"
```
