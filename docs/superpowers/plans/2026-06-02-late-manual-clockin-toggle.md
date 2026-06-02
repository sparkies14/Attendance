# Late Manual-Clock-In Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner/admin-flippable toggle that, when off, lets members who clock in after 9:10 JST do so automatically (no manual approval) while still being marked tardy.

**Architecture:** Store a `late_manual_required` flag in the existing `policy_config` key/value table (default `'on'`). The admin Policy-config route reads/writes it (toggle editable by owner+admin; thresholds stay owner-only). The member-data response surfaces it as `lateManualRequired`; the member HomePage forces manual mode only when `late && lateManualRequired`. The admin Policy page gets a switch.

**Tech Stack:** Node/Express, Supabase JS v2, Jest + supertest (backend); Next.js/React inline styles (frontend, gated on `tsc --noEmit`).

**Spec:** `docs/superpowers/specs/2026-06-02-late-manual-clockin-toggle-design.md`

---

## File Structure

- **Create** `migrations/022_add_late_manual_policy.sql` — seed the flag row.
- **Modify** `routes/adminPolicyConfig.js` — GET returns the flag; PATCH allows owner+admin for the toggle, owner-only for thresholds.
- **Create** `tests/adminPolicyConfig.test.js` — route tests (no route test exists today).
- **Modify** `routes/memberData.js` — include `lateManualRequired` in the response.
- **Modify** `tests/memberData.test.js` — assert the flag is surfaced.
- **Modify** `frontend/components/member/MemberDashboard.tsx` — add `lateManualRequired?` to `MemberData`.
- **Modify** `frontend/components/member/pages/HomePage.tsx` — honor the flag.
- **Modify** `frontend/components/admin/pages/PolicyPage.tsx` — the toggle switch.

---

## Task 1: Migration + policy-config route + route tests

**Files:**
- Create: `migrations/022_add_late_manual_policy.sql`
- Modify: `routes/adminPolicyConfig.js`
- Test: `tests/adminPolicyConfig.test.js` (create)

- [ ] **Step 1: Create the migration**

Create `migrations/022_add_late_manual_policy.sql`:

```sql
-- Toggle: require manual approval for late (post-9:10) clock-ins. Default on.
insert into policy_config (key, value) values ('late_manual_required', 'on')
on conflict (key) do nothing;
```

- [ ] **Step 2: Write the failing route tests**

Create `tests/adminPolicyConfig.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
  next();
});
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/adminPolicyConfig');

// Chainable that resolves to {data,error} for any awaited terminal.
function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:   (resolve) => resolve(result),
    select: jest.fn(() => ch),
    eq:     jest.fn(() => ch),
    update: jest.fn(() => ch),
    upsert: jest.fn(() => ch),
    insert: jest.fn(() => ch),
  };
  return ch;
}

const ROWS = [
  { key: 'threshold_minor_tardy', value: '3' },
  { key: 'threshold_major_tardy', value: '2' },
  { key: 'threshold_awol_half',   value: '1' },
  { key: 'threshold_awol_full',   value: '1' },
  { key: 'late_manual_required',  value: 'on' },
];

function makeApp(role) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email: 'x@x.com', role, user_id: 'u1' }; next(); });
  app.use('/', router);
  return app;
}

beforeEach(() => { jest.clearAllMocks(); supabase.from.mockReturnValue(c(ROWS)); });

describe('GET /', () => {
  test('returns integer thresholds and lateManualRequired boolean', async () => {
    const res = await request(makeApp('admin')).get('/');
    expect(res.status).toBe(200);
    expect(res.body.config).toEqual({ threshold_minor_tardy: 3, threshold_major_tardy: 2, threshold_awol_half: 1, threshold_awol_full: 1 });
    expect(res.body.lateManualRequired).toBe(true);
  });
});

describe('PATCH /', () => {
  test('admin can toggle late_manual_required', async () => {
    const res = await request(makeApp('admin')).patch('/').send({ late_manual_required: 'off' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('lateManualRequired');
  });

  test('admin CANNOT change a threshold (403)', async () => {
    const res = await request(makeApp('admin')).patch('/').send({ threshold_minor_tardy: 5 });
    expect(res.status).toBe(403);
  });

  test('owner can change a threshold', async () => {
    const res = await request(makeApp('owner')).patch('/').send({ threshold_minor_tardy: 5 });
    expect(res.status).toBe(200);
  });

  test('invalid toggle value is rejected (400)', async () => {
    const res = await request(makeApp('owner')).patch('/').send({ late_manual_required: 'maybe' });
    expect(res.status).toBe(400);
  });

  test('unknown key is rejected (400)', async () => {
    const res = await request(makeApp('owner')).patch('/').send({ nope: 1 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest tests/adminPolicyConfig.test.js 2>&1 | tail -25`
Expected: FAIL — `lateManualRequired` undefined on GET; admin PATCH of toggle currently 403 (PATCH is owner-only); etc.

- [ ] **Step 4: Rewrite the route**

Replace the entire body of `routes/adminPolicyConfig.js` with:

```javascript
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
const TOGGLE_KEY = 'late_manual_required';

function buildPayload(rows) {
  const config = {};
  let lateManualRequired = true;
  for (const row of rows || []) {
    if (row.key === TOGGLE_KEY) lateManualRequired = row.value === 'on';
    else config[row.key] = parseInt(row.value, 10);
  }
  return { config, lateManualRequired };
}

router.use(requireAuth);

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(buildPayload(data));
});

// Toggle is editable by owner + admin; numeric thresholds remain owner-only.
router.patch('/', requireRole('owner', 'admin'), async (req, res) => {
  const updates = req.body || {};
  const isOwner = req.user.role === 'owner';

  for (const [key, value] of Object.entries(updates)) {
    if (key === TOGGLE_KEY) {
      if (value !== 'on' && value !== 'off') {
        return res.status(400).json({ error: `${TOGGLE_KEY} must be 'on' or 'off'.` });
      }
      continue;
    }
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: `Unknown config key: ${key}` });
    }
    if (!isOwner) {
      return res.status(403).json({ error: 'Only the owner can change tardy thresholds.' });
    }
    const num = parseInt(value, 10);
    if (!Number.isInteger(num) || num < 1) {
      return res.status(400).json({ error: `${key} must be a positive integer.` });
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (key === TOGGLE_KEY) {
      const { error } = await supabase.from('policy_config').upsert({ key, value });
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabase.from('policy_config')
        .update({ value: String(parseInt(value, 10)) }).eq('key', key);
      if (error) return res.status(500).json({ error: error.message });
    }
  }

  const { data, error } = await supabase.from('policy_config').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(buildPayload(data));
});

module.exports = router;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/adminPolicyConfig.test.js 2>&1 | tail -25`
Expected: PASS (all 6).

- [ ] **Step 6: Commit**

```bash
git add migrations/022_add_late_manual_policy.sql routes/adminPolicyConfig.js tests/adminPolicyConfig.test.js
git commit -m "feat: late_manual_required policy toggle (owner+admin) in policy-config route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: member-data surfaces the flag

**Files:**
- Modify: `routes/memberData.js`
- Test: `tests/memberData.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/memberData.test.js`:

```javascript
describe('member-data lateManualRequired flag', () => {
  test('reports false when policy is off', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: { name: 'Maria Cruz', id: 1 } });
      if (t === 'policy_config') return builder({ data: { value: 'off' } });
      return builder({ data: [] });
    });
    const res = await request(makeApp())
      .get('/webhook/member-data?email=m@x.com&month=6&year=2026')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.lateManualRequired).toBe(false);
  });

  test('defaults to true when the policy row is missing', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: { name: 'Maria Cruz', id: 1 } });
      if (t === 'policy_config') return builder({ data: null });
      return builder({ data: [] });
    });
    const res = await request(makeApp())
      .get('/webhook/member-data?email=m@x.com&month=6&year=2026')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.body.lateManualRequired).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/memberData.test.js -t "lateManualRequired" 2>&1 | tail -20`
Expected: FAIL — `res.body.lateManualRequired` is undefined.

- [ ] **Step 3: Add the policy_config query to the Promise.all**

In `routes/memberData.js`, add a sixth query to the `await Promise.all([...])` block (after the `plan_events` query) and a matching destructured binding `{ data: latePolicy }` at the top of the destructure:

Destructure becomes:
```javascript
  const [
    { data: allAttendance },
    { data: allLeave },
    { data: lunchRows },
    { data: breakRows },
    { data: monthPlanEvents },
    { data: latePolicy },
  ] = await Promise.all([
```
And add as the last array element (after the plan_events query, keeping its trailing comma):
```javascript
    supabase.from('policy_config').select('value').eq('key', 'late_manual_required').maybeSingle(),
```

- [ ] **Step 4: Compute and include the flag in the response**

Just before the final `res.json({ ... })`, add:
```javascript
  const lateManualRequired = (latePolicy?.value ?? 'on') === 'on';
```
And add this field inside the `res.json({ ... })` object (e.g. after `lunchConsumed,`):
```javascript
    lateManualRequired,
```

- [ ] **Step 5: Run tests**

Run: `npx jest tests/memberData.test.js 2>&1 | tail -20`
Expected: PASS (new tests + existing memberData tests).

- [ ] **Step 6: Commit**

```bash
git add routes/memberData.js tests/memberData.test.js
git commit -m "feat: member-data surfaces lateManualRequired flag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Member HomePage honors the flag

**Files:**
- Modify: `frontend/components/member/MemberDashboard.tsx` (MemberData interface)
- Modify: `frontend/components/member/pages/HomePage.tsx`

- [ ] **Step 1: Add the field to the MemberData type**

In `frontend/components/member/MemberDashboard.tsx`, inside the `MemberData` interface (around line 66-90, near `breakBudgetSecs?: number;`), add:
```typescript
  lateManualRequired?: boolean;
```

- [ ] **Step 2: Add HomePage state for the flag**

In `frontend/components/member/pages/HomePage.tsx`, after the `const [isLate, setIsLate] = useState(false);` line (around line 102), add:
```typescript
  const [lateManualRequired, setLateManualRequired] = useState(memberData?.lateManualRequired ?? true);
```

- [ ] **Step 3: Set the flag from refreshData**

In `refreshData` (around line 167-182), after `setLunchConsumed(d.lunchConsumed ?? false);`, add:
```typescript
        setLateManualRequired(d.lateManualRequired ?? true);
```

- [ ] **Step 4: Gate manual mode on the flag**

Replace the `checkLate` effect (currently `HomePage.tsx:150-160`):
```typescript
  useEffect(() => {
    function checkLate() {
      const { hour, minute } = getJST();
      const late = hour > 9 || (hour === 9 && minute > 10);
      setIsLate(late);
      setEntryType(late ? 'manual' : 'auto');
    }
    checkLate();
    const id = setInterval(checkLate, 60_000);
    return () => clearInterval(id);
  }, []);
```
with:
```typescript
  useEffect(() => {
    function checkLate() {
      const { hour, minute } = getJST();
      const late = hour > 9 || (hour === 9 && minute > 10);
      setIsLate(late);
      setEntryType(late && lateManualRequired ? 'manual' : 'auto');
    }
    checkLate();
    const id = setInterval(checkLate, 60_000);
    return () => clearInterval(id);
  }, [lateManualRequired]);
```

- [ ] **Step 5: Gate the badge + add a "running late" note**

In the Entry block (currently `HomePage.tsx:407-420`), change the `{isLate ? (` condition to `{(isLate && lateManualRequired) ? (`. The badge and the else-branch toggle are otherwise unchanged. Then, immediately after the closing `</div>` of the flex row that holds the Entry label (the `</div>` currently at line 421, before the `{entryType === 'manual' && (` block at line 422), add:
```tsx
              {isLate && !lateManualRequired && (
                <div style={{ marginTop: 8, fontFamily: F_MONO, fontSize: 10.5, color: C.accent, letterSpacing: '0.02em' }}>
                  Running late — you&apos;ll be clocked in now and still marked tardy.
                </div>
              )}
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/member/MemberDashboard.tsx frontend/components/member/pages/HomePage.tsx
git commit -m "feat: member clock-in honors late_manual_required flag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Admin PolicyPage toggle switch + final verification

**Files:**
- Modify: `frontend/components/admin/pages/PolicyPage.tsx`

- [ ] **Step 1: Track the flag in state**

In `frontend/components/admin/pages/PolicyPage.tsx`, after the existing state declarations (around line 35-40), add:
```typescript
  const [lateManual, setLateManual] = useState<boolean>(true);
  const [toggleBusy, setToggleBusy] = useState(false);
```

- [ ] **Step 2: Read the flag on load**

In the `useEffect` that fetches `/admin/policy-config` (around line 46), the response now includes `lateManualRequired`. Where the fetched data is applied (the `.then(...)` that sets `config`/`draft`), also set the flag. Locate the fetch block:
```typescript
    clientFetch(`${apiUrl}/admin/policy-config`)
```
and in its JSON handler add (alongside `setConfig`/`setDraft`):
```typescript
        setLateManual(d.lateManualRequired ?? true);
```
(If the handler variable is not named `d`, use the actual parsed-response variable name in that block.)

- [ ] **Step 3: Add the toggle handler**

Add this function inside the component (near `save`, around line 53):
```typescript
  async function toggleLateManual() {
    setToggleBusy(true);
    setSaveErr(null);
    try {
      const next = !lateManual;
      const res  = await clientFetch(`${apiUrl}/admin/policy-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ late_manual_required: next ? 'on' : 'off' }),
      });
      const d = await res.json();
      if (!res.ok) { setSaveErr(d.error ?? 'Failed to update.'); }
      else { setLateManual(d.lateManualRequired ?? next); setSaveMsg(`Manual-for-late ${next ? 'enabled' : 'disabled'}.`); setTimeout(() => setSaveMsg(null), 3_000); }
    } catch { setSaveErr('Network error.'); }
    finally { setToggleBusy(false); }
  }
```

- [ ] **Step 4: Render the toggle**

Immediately after the threshold `<form onSubmit={save}>...</form>` block (after its closing `</form>`, around line 110), add a toggle card:
```tsx
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontFamily: F_SANS, fontSize: 13.5, color: C.text, fontWeight: 500 }}>
                Require manual approval for late (post-9:10) clock-ins
              </div>
              <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 4, letterSpacing: '0.02em' }}>
                Off — late members clock in automatically but are still marked tardy.
              </div>
            </div>
            <button
              type="button"
              onClick={toggleLateManual}
              disabled={toggleBusy}
              aria-pressed={lateManual}
              style={{ position: 'relative', width: 46, height: 26, flexShrink: 0, borderRadius: 999, border: 'none', cursor: toggleBusy ? 'default' : 'pointer', background: lateManual ? C.accent : C.borderStrong, transition: 'background 0.15s', opacity: toggleBusy ? 0.6 : 1 }}
            >
              <span style={{ position: 'absolute', top: 3, left: lateManual ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
            </button>
          </div>
        </div>
```
Note: this toggle is editable by owner AND admin (no `isOwner` gate), unlike the thresholds above it. Confirm `C.borderStrong` exists in the `C` palette in this file; if not, use `C.border`.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: clean.

- [ ] **Step 6: Full backend suite**

Run (from repo root): `npx jest 2>&1 | tail -8`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/admin/pages/PolicyPage.tsx
git commit -m "feat: admin Policy page toggle for late manual clock-in

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: Visual verification (playwright-cli, optional)**

Log in as owner, open Settings → Policy config, toggle the switch off, then (as a member or via the member page) confirm a simulated post-9:10 state no longer forces manual entry. Screenshot for review. (May be deferred if there is no active member with a clock-in scenario.)

---

## Verification Before Completion

- `npx jest` — full backend suite green (adds ~7 tests).
- `cd frontend && npx tsc --noEmit` — clean.
- Requires `migrations/022_add_late_manual_policy.sql` to be run in Supabase; until then GET and member-data default the flag to `on` (current behavior preserved).
- Push to `origin/main` so Vercel + Render auto-deploy (per project workflow).

## Notes

- The toggle value is stored as `'on'`/`'off'` strings; the API surfaces it as the boolean `lateManualRequired`.
- Tardy tracking is unaffected — `classifyLateStatus` still records `late_status` on every clock-in regardless of the flag.
