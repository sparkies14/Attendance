# Official + Manual Holidays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-import official public holidays for 7 countries (PH, JP, TH, MM, IN, BD, MY) from Calendarific while keeping manual entry, surface them on the admin Holidays page with AUTO/MANUAL badges, and show each member their country's holidays on the Calendar tab.

**Architecture:** A `source` column splits auto vs manual holidays. A small `lib/calendarific.js` fetches+normalizes national holidays; an owner-only `POST /admin/holidays/sync` does delete-auto-then-insert per country+year. A member endpoint `GET /holidays/mine` returns the logged-in user's country holidays. Frontend adds a sync panel + badges (admin) and holiday highlighting + list (member). A latent route-prefix bug in `adminHolidays.js` is fixed as a prerequisite.

**Tech Stack:** Node/Express + Supabase JS (backend), Jest + supertest (backend tests), Next.js 15 / React 19 / TypeScript (frontend). Calendarific REST API (free key via `CALENDARIFIC_API_KEY`).

---

## File Structure

- **Create** `migrations/019_add_source_to_holidays.sql` — add `source` column (run manually in Supabase).
- **Create** `lib/holidays.js` — supported-country list + validation helper (backend).
- **Create** `lib/calendarific.js` — fetch + normalize national holidays.
- **Modify** `routes/adminHolidays.js` — fix route paths to `/holidays*`; add `POST /holidays/sync`.
- **Create** `routes/holidays.js` — member read endpoint `GET /mine`.
- **Modify** `server.js` — mount `routes/holidays.js` at `/holidays`.
- **Create** `tests/holidaysSync.test.js`, `tests/calendarific.test.js`, `tests/holidaysMine.test.js`.
- **Modify** `frontend/components/admin/pages/HolidaysPage.tsx` — sync panel + AUTO/MANUAL badges.
- **Modify** `frontend/components/member/pages/CalendarPage.tsx` — fetch + highlight + list holidays.

Backend test command: `npx jest` from repo root. Frontend type-check: `cd frontend && npx tsc --noEmit`.

---

## Task 1: Migration — add `source` column

**Files:**
- Create: `migrations/019_add_source_to_holidays.sql`

- [ ] **Step 1: Create the migration file**

`migrations/019_add_source_to_holidays.sql`:

```sql
-- Distinguish auto-imported holidays from manually-entered ones.
alter table holidays add column if not exists source text not null default 'manual';
```

- [ ] **Step 2: Commit**

```bash
git add migrations/019_add_source_to_holidays.sql
git commit -m "feat: add source column migration for holidays (manual vs auto)"
```

- [ ] **Step 3: Flag for the user**

This migration must be run manually in the Supabase SQL Editor (same as prior
migrations). Note it in the final summary so the user runs it before syncing.

---

## Task 2: Fix `adminHolidays.js` route prefixes

The router is mounted at `/admin` but its routes are at bare `/` and `/:id`, so
`/admin/holidays` 404s today. Prefix them with `/holidays`.

**Files:**
- Modify: `routes/adminHolidays.js`
- Test: `tests/holidaysSync.test.js` (regression test for the GET path; the file is reused in later tasks)

- [ ] **Step 1: Write the failing test**

Create `tests/holidaysSync.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router = require('../routes/adminHolidays');

function chain(result) {
  const ch = {};
  ['select','insert','upsert','delete','eq','gte','lte','order','in','update'].forEach(m => { ch[m] = jest.fn(() => ch); });
  ch.then = (resolve) => resolve(result);
  ch.single = jest.fn(() => Promise.resolve(result));
  return ch;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/admin', router);
  return app;
}

const ownerToken = () => signToken({ user_id: 'u1', email: 'owner@x.com', role: 'owner' });

beforeEach(() => { jest.clearAllMocks(); delete process.env.CALENDARIFIC_API_KEY; global.fetch = jest.fn(); });

describe('GET /admin/holidays (route prefix)', () => {
  test('returns the holidays list at the /admin/holidays path', async () => {
    supabase.from.mockReturnValue(chain({ data: [{ id: 'h1', date: '2026-01-01', name: "New Year", country: 'PH', source: 'manual' }], error: null }));
    const res = await request(makeApp())
      .get('/admin/holidays')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.holidays).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/holidaysSync.test.js`
Expected: FAIL — GET `/admin/holidays` returns 404 (route is at `/`).

- [ ] **Step 3: Fix the route paths**

In `routes/adminHolidays.js`, change the three route path strings:
- `router.get('/', ...)` → `router.get('/holidays', ...)`
- `router.post('/', ...)` → `router.post('/holidays', ...)`
- `router.delete('/:id', ...)` → `router.delete('/holidays/:id', ...)`

Leave everything else (handlers, `requireRole` guards) unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/holidaysSync.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/adminHolidays.js tests/holidaysSync.test.js
git commit -m "fix: correct adminHolidays route prefixes so /admin/holidays resolves"
```

---

## Task 3: `lib/holidays.js` — supported countries

**Files:**
- Create: `lib/holidays.js`
- Test: `tests/holidaysMine.test.js` is separate; add a tiny inline test here.

- [ ] **Step 1: Write the failing test**

Create `tests/holidaysLib.test.js`:

```javascript
const { SUPPORTED_COUNTRIES, SUPPORTED_CODES, isSupportedCountry } = require('../lib/holidays');

describe('lib/holidays', () => {
  test('exposes the 7 supported countries with codes and names', () => {
    expect(SUPPORTED_CODES).toEqual(['PH','JP','TH','MM','IN','BD','MY']);
    expect(SUPPORTED_COUNTRIES.find(c => c.code === 'MM').name).toBe('Myanmar');
  });
  test('isSupportedCountry validates membership', () => {
    expect(isSupportedCountry('PH')).toBe(true);
    expect(isSupportedCountry('US')).toBe(false);
    expect(isSupportedCountry('')).toBe(false);
    expect(isSupportedCountry(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/holidaysLib.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/holidays.js`**

```javascript
const SUPPORTED_COUNTRIES = [
  { code: 'PH', name: 'Philippines' },
  { code: 'JP', name: 'Japan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'IN', name: 'India' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'MY', name: 'Malaysia' },
];

const SUPPORTED_CODES = SUPPORTED_COUNTRIES.map(c => c.code);

function isSupportedCountry(code) {
  return SUPPORTED_CODES.includes(code);
}

module.exports = { SUPPORTED_COUNTRIES, SUPPORTED_CODES, isSupportedCountry };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/holidaysLib.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/holidays.js tests/holidaysLib.test.js
git commit -m "feat: add supported-countries list for holiday sync"
```

---

## Task 4: `lib/calendarific.js` — fetch + normalize

**Files:**
- Create: `lib/calendarific.js`
- Test: `tests/calendarific.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/calendarific.test.js`:

```javascript
const { fetchHolidays } = require('../lib/calendarific');

function mockFetchOnce(payload, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn(() => Promise.resolve({ ok, status, json: async () => payload }));
}

beforeEach(() => { jest.clearAllMocks(); });

describe('fetchHolidays', () => {
  test('keeps only national holidays and normalizes date to YYYY-MM-DD', async () => {
    mockFetchOnce({
      meta: { code: 200 },
      response: { holidays: [
        { name: "New Year's Day", date: { iso: '2026-01-01T00:00:00' }, type: ['National holiday'] },
        { name: 'Some Observance',  date: { iso: '2026-02-02' },          type: ['Observance'] },
        { name: 'Independence Day', date: { iso: '2026-06-12' },          type: ['National holiday'] },
      ] },
    });
    const out = await fetchHolidays('PH', 2026, 'key');
    expect(out).toEqual([
      { date: '2026-01-01', name: "New Year's Day" },
      { date: '2026-06-12', name: 'Independence Day' },
    ]);
  });

  test('throws a provider error on a non-200 meta code', async () => {
    mockFetchOnce({ meta: { code: 401, error_detail: 'Invalid API key' } });
    await expect(fetchHolidays('PH', 2026, 'bad')).rejects.toThrow('Invalid API key');
  });

  test('throws on HTTP failure', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    await expect(fetchHolidays('PH', 2026, 'key')).rejects.toThrow('HTTP 500');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/calendarific.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/calendarific.js`**

```javascript
// Fetches national public holidays for a country+year from Calendarific and
// normalizes them to { date: 'YYYY-MM-DD', name }. Throws on provider errors.
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/calendarific.test.js`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/calendarific.js tests/calendarific.test.js
git commit -m "feat: add Calendarific client to fetch national holidays"
```

---

## Task 5: `POST /admin/holidays/sync` endpoint

**Files:**
- Modify: `routes/adminHolidays.js`
- Test: `tests/holidaysSync.test.js` (extend the file from Task 2)

- [ ] **Step 1: Add failing tests**

Append these tests inside `tests/holidaysSync.test.js` (after the existing
`describe`):

```javascript
describe('POST /admin/holidays/sync', () => {
  test('400 when API key not configured', async () => {
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ country: 'PH', year: 2026 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/API key/i);
  });

  test('400 for unsupported country', async () => {
    process.env.CALENDARIFIC_API_KEY = 'key';
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ country: 'US', year: 2026 });
    expect(res.status).toBe(400);
  });

  test('imports national holidays: deletes old auto rows then inserts', async () => {
    process.env.CALENDARIFIC_API_KEY = 'key';
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ meta: { code: 200 }, response: { holidays: [
        { name: "New Year's Day", date: { iso: '2026-01-01' }, type: ['National holiday'] },
        { name: 'Independence Day', date: { iso: '2026-06-12' }, type: ['National holiday'] },
      ] } }),
    }));
    const deleteCh = chain({ error: null });
    const insertCh = chain({ error: null });
    supabase.from.mockImplementation(() => ({
      delete: deleteCh.delete,
      eq: deleteCh.eq, gte: deleteCh.gte, lte: deleteCh.lte, then: deleteCh.then,
      upsert: insertCh.upsert, insert: insertCh.insert,
    }));
    // Simpler: just return a generic chain for any call
    supabase.from.mockReturnValue(chain({ error: null }));

    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ country: 'PH', year: 2026 });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
  });

  test('502 on provider error', async () => {
    process.env.CALENDARIFIC_API_KEY = 'key';
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ meta: { code: 401, error_detail: 'Invalid API key' } }) }));
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ country: 'PH', year: 2026 });
    expect(res.status).toBe(502);
  });

  test('403 for non-owner', async () => {
    process.env.CALENDARIFIC_API_KEY = 'key';
    const adminToken = signToken({ user_id: 'u9', email: 'a@x.com', role: 'admin' });
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ country: 'PH', year: 2026 });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx jest tests/holidaysSync.test.js`
Expected: FAIL — `/admin/holidays/sync` route does not exist yet (404s).

- [ ] **Step 3: Add the sync route to `routes/adminHolidays.js`**

At the top of `routes/adminHolidays.js`, after the existing requires, add:

```javascript
const { isSupportedCountry } = require('../lib/holidays');
const { fetchHolidays } = require('../lib/calendarific');
```

Then add this route (place it before `module.exports`):

```javascript
router.post('/holidays/sync', requireRole('owner'), async (req, res) => {
  const { country, year } = req.body || {};
  const y = parseInt(year, 10);

  if (!isSupportedCountry(country)) {
    return res.status(400).json({ error: 'Unsupported country.' });
  }
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return res.status(400).json({ error: 'Invalid year.' });
  }

  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Holiday API key not configured.' });
  }

  let holidays;
  try {
    holidays = await fetchHolidays(country, y, apiKey);
  } catch (err) {
    return res.status(502).json({ error: `Holiday provider error: ${err.message}` });
  }

  // Replace this country+year's auto rows; never touch manual rows.
  const del = await supabase.from('holidays').delete()
    .eq('country', country)
    .eq('source', 'auto')
    .gte('date', `${y}-01-01`)
    .lte('date', `${y}-12-31`);
  if (del.error) return res.status(500).json({ error: del.error.message });

  if (holidays.length) {
    const rows = holidays.map(h => ({ date: h.date, name: h.name, country, source: 'auto' }));
    // ignoreDuplicates so an auto row never collides with a manual row on (date,country).
    const ins = await supabase.from('holidays').upsert(rows, { onConflict: 'date,country', ignoreDuplicates: true });
    if (ins.error) return res.status(500).json({ error: ins.error.message });
  }

  return res.json({ imported: holidays.length });
});
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx jest tests/holidaysSync.test.js`
Expected: PASS (6 total in this file).

- [ ] **Step 5: Commit**

```bash
git add routes/adminHolidays.js tests/holidaysSync.test.js
git commit -m "feat: add POST /admin/holidays/sync to import official holidays"
```

---

## Task 6: `GET /holidays/mine` member endpoint

**Files:**
- Create: `routes/holidays.js`
- Modify: `server.js` (mount at `/holidays`)
- Test: `tests/holidaysMine.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/holidaysMine.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router = require('../routes/holidays');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/holidays', router);
  return app;
}

const memberToken = () => signToken({ user_id: 'u1', email: 'm@x.com', role: 'member' });

// `users` lookup resolves via maybeSingle; `holidays` query resolves via thenable chain.
function userChain(user) {
  const ch = { select: jest.fn(() => ch), eq: jest.fn(() => ch), maybeSingle: jest.fn(() => Promise.resolve({ data: user, error: null })) };
  return ch;
}
function holidayChain(rows) {
  const ch = { select: jest.fn(() => ch), eq: jest.fn(() => ch), gte: jest.fn(() => ch), lte: jest.fn(() => ch), order: jest.fn(() => ch), then: (r) => r({ data: rows, error: null }) };
  return ch;
}

beforeEach(() => { jest.clearAllMocks(); });

describe('GET /holidays/mine', () => {
  test('returns the logged-in user country holidays', async () => {
    supabase.from.mockImplementation((t) => t === 'users'
      ? userChain({ country: 'PH' })
      : holidayChain([{ id: 'h1', date: '2026-06-12', name: 'Independence Day', country: 'PH', source: 'auto' }]));

    const res = await request(makeApp())
      .get('/holidays/mine?year=2026')
      .set('Authorization', `Bearer ${memberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.country).toBe('PH');
    expect(res.body.holidays).toHaveLength(1);
  });

  test('user with no country returns empty list', async () => {
    supabase.from.mockImplementation((t) => t === 'users' ? userChain({ country: null }) : holidayChain([]));
    const res = await request(makeApp())
      .get('/holidays/mine?year=2026')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.country).toBeNull();
    expect(res.body.holidays).toEqual([]);
  });

  test('401 when unauthenticated', async () => {
    const res = await request(makeApp()).get('/holidays/mine?year=2026');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/holidaysMine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `routes/holidays.js`**

```javascript
const router = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/mine', async (req, res) => {
  let year = parseInt(req.query.year, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    year = new Date().getFullYear();
  }

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('country')
    .eq('id', req.user.user_id)
    .maybeSingle();
  if (uErr) return res.status(500).json({ error: uErr.message });

  const country = user && user.country ? user.country : null;
  if (!country) return res.json({ country: null, holidays: [] });

  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .eq('country', country)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ country, holidays: data || [] });
});

module.exports = router;
```

- [ ] **Step 4: Mount in `server.js`**

After the line `app.use('/admin', require('./routes/adminPolicyConfig'));` (line 48), add:

```javascript
app.use('/holidays', require('./routes/holidays'));
```

- [ ] **Step 5: Run to verify pass + full suite**

Run: `npx jest tests/holidaysMine.test.js` → PASS (3).
Run: `npx jest` → all suites pass.

- [ ] **Step 6: Commit**

```bash
git add routes/holidays.js server.js tests/holidaysMine.test.js
git commit -m "feat: add GET /holidays/mine for member calendar holidays"
```

---

## Task 7: Admin Holidays page — sync panel + badges

**Files:**
- Modify: `frontend/components/admin/pages/HolidaysPage.tsx`

- [ ] **Step 1: Read the file**

Read `frontend/components/admin/pages/HolidaysPage.tsx` fully. Note: `Holiday`
interface is `{ id: number; date: string; name: string; country: string; }`,
there is a `holidays` state array, an `addHoliday` form, a `country` filter, a
`load`/`useEffect` that GETs `${apiUrl}/admin/holidays`, and the `C`/`F_*` style
constants. The list renders rows per holiday.

- [ ] **Step 2: Extend the Holiday interface and add a country list + sync state**

Add `source?: string;` to the `Holiday` interface. Near the top of the component
(with the other `useState` calls), add the supported-country list and sync state:

```tsx
  const COUNTRIES = [
    { code: 'PH', name: 'Philippines' }, { code: 'JP', name: 'Japan' },
    { code: 'TH', name: 'Thailand' },    { code: 'MM', name: 'Myanmar' },
    { code: 'IN', name: 'India' },       { code: 'BD', name: 'Bangladesh' },
    { code: 'MY', name: 'Malaysia' },
  ];
  const [syncCountry, setSyncCountry] = useState('PH');
  const [syncYear,    setSyncYear]    = useState(new Date().getFullYear());
  const [syncBusy,    setSyncBusy]    = useState(false);
  const [syncMsg,     setSyncMsg]     = useState<string | null>(null);
  const [syncErr,     setSyncErr]     = useState<string | null>(null);
```

- [ ] **Step 3: Add the sync handler**

Add this function inside the component (near `addHoliday`):

```tsx
  async function syncHolidays() {
    setSyncBusy(true); setSyncMsg(null); setSyncErr(null);
    try {
      const res = await clientFetch(`${apiUrl}/admin/holidays/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: syncCountry, year: syncYear }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(`Imported ${data.imported} holiday${data.imported === 1 ? '' : 's'} for ${syncCountry} ${syncYear}.`);
        // refresh the list
        const list = await clientFetch(`${apiUrl}/admin/holidays`).then(r => r.json());
        setHolidays(list?.holidays ?? []);
      } else {
        setSyncErr(data.error ?? 'Sync failed.');
      }
    } catch {
      setSyncErr('Network error.');
    } finally {
      setSyncBusy(false);
    }
  }
```

- [ ] **Step 4: Render the sync panel**

Add this panel above the holiday list (after the manual add form). Match the
existing style constants:

```tsx
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Sync official holidays
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={syncCountry} onChange={e => setSyncCountry(e.target.value)}
            style={{ padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F_SANS, fontSize: 13, color: C.text, background: C.surface }}>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
          </select>
          <input type="number" value={syncYear} onChange={e => setSyncYear(parseInt(e.target.value, 10) || syncYear)}
            style={{ padding: '7px 10px', width: 90, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F_MONO, fontSize: 13, color: C.text, background: C.surface }} />
          <button onClick={syncHolidays} disabled={syncBusy}
            style={{ padding: '7px 14px', background: C.text, color: C.surface, border: 'none', borderRadius: 8, fontFamily: F_SANS, fontSize: 13, fontWeight: 500, cursor: syncBusy ? 'not-allowed' : 'pointer', opacity: syncBusy ? 0.6 : 1 }}>
            {syncBusy ? 'Syncing…' : 'Sync'}
          </button>
          {syncMsg && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.green }}>{syncMsg}</span>}
          {syncErr && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{syncErr}</span>}
        </div>
      </div>
```

(If the file's `C` lacks `green`/`red`, use the literal hex `#16a34a` / `#dc2626`.)

- [ ] **Step 5: Add a source badge to each holiday row**

In the holiday list row rendering, add a badge next to the name. Use the row's
`h.source`:

```tsx
            <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 999, fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.06em',
              background: h.source === 'auto' ? '#f5f5f5' : 'rgba(37,99,235,0.08)',
              color: h.source === 'auto' ? '#737373' : '#2563eb',
              border: `1px solid ${h.source === 'auto' ? '#e6e6e6' : 'rgba(37,99,235,0.22)'}` }}>
              {h.source === 'auto' ? 'AUTO' : 'MANUAL'}
            </span>
```

(Place it inside the existing row, adjacent to where the holiday name is shown.
Read the row markup and insert accordingly.)

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/admin/pages/HolidaysPage.tsx
git commit -m "feat: add holiday sync panel and AUTO/MANUAL badges to admin page"
```

---

## Task 8: Member Calendar — holiday highlight + list

**Files:**
- Modify: `frontend/components/member/pages/CalendarPage.tsx`

- [ ] **Step 1: Read the file**

Read `frontend/components/member/pages/CalendarPage.tsx`. Note: it has `month`
and `year` state; it renders a month grid where `cells` is
`[...Array(firstDow).fill(null), ...calendar]` and each non-null cell is a
`CalendarDay` with a numeric `cell.day`. Style constants `C`, `F_SANS`, `F_MONO`
exist. `clientFetch` is imported.

- [ ] **Step 2: Add holiday state + fetch**

Add state near the other `useState` calls:

```tsx
  const [holidays, setHolidays] = useState<{ date: string; name: string }[]>([]);
```

Add a fetch effect that runs when `year` changes:

```tsx
  useEffect(() => {
    let cancelled = false;
    clientFetch(`${apiUrl}/holidays/mine?year=${year}`)
      .then(r => r.ok ? r.json() : { holidays: [] })
      .then(d => { if (!cancelled) setHolidays(Array.isArray(d.holidays) ? d.holidays : []); })
      .catch(() => { if (!cancelled) setHolidays([]); });
    return () => { cancelled = true; };
  }, [apiUrl, year]);
```

- [ ] **Step 3: Build a holiday lookup for the visible month**

Before the JSX `return`, derive a map of `day number → holiday name` for the
current `month`/`year`:

```tsx
  const holidayByDay: Record<number, string> = {};
  for (const h of holidays) {
    // h.date is 'YYYY-MM-DD'
    const [hy, hm, hd] = h.date.split('-').map(Number);
    if (hy === year && hm === month) holidayByDay[hd] = h.name;
  }
  const monthHolidays = holidays.filter(h => {
    const [hy, hm] = h.date.split('-').map(Number);
    return hy === year && hm === month;
  });
```

- [ ] **Step 4: Highlight holiday days in the grid**

In the cell rendering (where each non-null `cell` is drawn), add a holiday marker
when `holidayByDay[cell.day]` exists. Inside the cell's container, add:

```tsx
                {holidayByDay[cell.day] && (
                  <span title={holidayByDay[cell.day]} style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
                )}
```

Ensure the cell's container style includes `position: 'relative'` so the dot
anchors correctly (add it if missing).

- [ ] **Step 5: Render a "Holidays" list for the month**

In the right-hand column area of the calendar (near the day detail / side panel),
add a compact list:

```tsx
        {monthHolidays.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginTop: 12 }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Holidays</div>
            {monthHolidays.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0' }}>
                <span style={{ fontFamily: F_MONO, fontSize: 11, color: '#dc2626', minWidth: 56 }}>{h.date.slice(5)}</span>
                <span style={{ fontFamily: F_SANS, fontSize: 12.5, color: C.text }}>{h.name}</span>
              </div>
            ))}
          </div>
        )}
```

(Place inside the existing right-column container; read the markup to position it
sensibly under the day-detail card.)

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/member/pages/CalendarPage.tsx
git commit -m "feat: show country holidays on member calendar (highlight + list)"
```

---

## Task 9: Verify in the running app

**Files:** none (verification only).

- [ ] **Step 1: Backend smoke (full suite)**

Run: `npx jest`
Expected: all suites pass (existing + new holiday tests).

- [ ] **Step 2: Frontend type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Harness — admin sync panel & badges**

Create `frontend/app/verify-tmp/page.tsx` rendering `HolidaysPage` with
`apiUrl="http://localhost:3000"` (backend absent → list falls back/empty, sync
shows an error on click — but the panel + add form + badges markup render). Start
`npm run dev`, `curl -s http://localhost:3001/verify-tmp` and grep for
`Sync official holidays` (expect ≥1). Then delete the harness and `.next`.

- [ ] **Step 4: Harness — member calendar holiday list**

Create a harness rendering `CalendarPage` with mock `initialData` (a `calendar`
array with a few `CalendarDay`s) and `apiUrl` pointing nowhere; confirm the page
renders without crashing (holiday fetch fails → no highlights, calendar still
shows). Grep the HTML for the month title. Delete the harness and `.next`.

- [ ] **Step 5: No commit** (verification only).

---

## Self-Review Notes

- **Spec coverage:** supported countries (Task 3) ✓; `source` column (Task 1) ✓; Calendarific national-holiday filter + normalize (Task 4) ✓; `POST /admin/holidays/sync` owner-only, delete-auto-then-insert, error codes (Task 5) ✓; `GET /holidays/mine` (Task 6) ✓; route-prefix bug fix (Task 2) ✓; admin sync panel + AUTO/MANUAL badges (Task 7) ✓; member highlight + list (Task 8) ✓; verification (Task 9) ✓; env var `CALENDARIFIC_API_KEY` surfaced (Task 5 + final summary).
- **Placeholder scan:** all code blocks complete; frontend insertion steps direct the engineer to read the file first because exact line anchors vary, but provide the full snippet to insert.
- **Type consistency:** endpoint returns `{ imported }` (Task 5) matches admin handler reading `data.imported` (Task 7); `{ country, holidays }` (Task 6) matches member fetch reading `d.holidays` (Task 8); `source` field added to `Holiday` (Task 7) matches the column (Task 1) and badge usage; `fetchHolidays(country, year, apiKey)` signature consistent between Task 4 and Task 5.
- **Manual step:** migration 019 must be run in Supabase before syncing; `CALENDARIFIC_API_KEY` must be set on Render.
