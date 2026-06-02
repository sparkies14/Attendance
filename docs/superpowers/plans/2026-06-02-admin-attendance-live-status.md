# Admin Attendance Live-Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix clocked-in members showing as "Absent" on the admin Attendance dashboard, and surface live lunch/break status (with over-budget flags), real on-leave counts, and an emergency panel.

**Architecture:** Extend the existing `GET /webhook/dashboard` route to also fetch today's `break_log`, `lunch_log`, and approved `leave_log`, enriching each member object and the `summary` in one round trip (mirroring `routes/memberData.js:103-114`). The frontend `AttendancePage.tsx` consumes the new fields: a 5-card stat row, a live-ticking lunch/break panel, and an emergency panel.

**Tech Stack:** Node.js / Express, Supabase JS v2, Jest + supertest (backend); Next.js / React with inline styles (frontend). Frontend has no unit-test runner — frontend tasks gate on `tsc --noEmit` plus playwright-cli visual checks.

**Spec:** `docs/superpowers/specs/2026-06-02-admin-attendance-live-status-design.md`

---

## File Structure

- **Modify** `routes/dashboard.js` — date-fix + break/lunch/leave/emergency enrichment + summary counts + budgets.
- **Create** `tests/dashboard.test.js` — route tests (regression guard for the date bug + enrichment).
- **Modify** `frontend/components/admin/AdminDashboard.tsx` — extend `DashboardData` types.
- **Modify** `frontend/components/admin/pages/AttendancePage.tsx` — stat row, lunch/break panel + `OutChip`, emergency panel.

---

## Task 1: Fix the absent bug (date format) + regression test

**Files:**
- Modify: `routes/dashboard.js:3,11`
- Test: `tests/dashboard.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/dashboard.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (..._roles) => (req, _res, next) => next());
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/dashboard');

// Chainable builder; records every .eq(col,val) into `rec` if provided.
function builder(result, rec) {
  const b = {};
  ['select', 'insert', 'update', 'delete', 'order', 'gte', 'lte', 'in'].forEach(m => (b[m] = jest.fn(() => b)));
  b.eq = jest.fn((col, val) => { if (rec) rec.push([col, val]); return b; });
  b.maybeSingle = jest.fn(() => Promise.resolve(result));
  b.then = (r) => r(result);
  return b;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email: 'admin@x.com', role: 'owner', user_id: 'a1' }; next(); });
  app.use('/', router);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('GET / — absent bug (date-format root cause)', () => {
  test('queries attendance with ISO (YYYY-MM-DD) date, so a clocked-in member is not Absent', async () => {
    const attEqs = [];
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: [{ name: 'Maria Cruz', email: 'maria@x.com', job_role: 'Dev', status: 'Active' }] });
      if (t === 'attendance') return builder({ data: [{ email: 'maria@x.com', clock_in: '09:00:00', clock_out: '', late_status: 'ON TIME', status: 'Approved' }] }, attEqs);
      return builder({ data: [] }); // leave_log, break_log, lunch_log
    });

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    // The bug: dashboard used todayJST() => "M/D/YYYY", never matching stored "YYYY-MM-DD".
    expect(attEqs).toContainEqual(['date', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    const maria = res.body.members.find(m => m.email === 'maria@x.com');
    expect(maria.status).toBe('CLOCKED IN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/dashboard.test.js -t "absent bug" 2>&1 | tail -20`
Expected: FAIL — `attEqs` contains `['date', '6/2/2026']` (en-US), not matching the ISO regex; `maria.status` is `NOT CLOCKED IN`.

- [ ] **Step 3: Apply the fix**

In `routes/dashboard.js` line 3, change the import:

```javascript
const { todayJSTISO } = require('../lib/rules');
```

In `routes/dashboard.js` line 11, change:

```javascript
  const today = todayJSTISO();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/dashboard.test.js -t "absent bug" 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/dashboard.js tests/dashboard.test.js
git commit -m "fix: admin dashboard counted clocked-in members as absent (date format)

Dashboard queried attendance with todayJST() (M/D/YYYY) but rows are
stored with the client's ISO date (YYYY-MM-DD), so nothing matched and
every member fell through to NOT CLOCKED IN. Same trap as commit 9e6e5f0.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — enrich dashboard with break/lunch/leave/emergency + summary + budgets

**Files:**
- Modify: `routes/dashboard.js` (Promise.all block, member map, summary, response)
- Test: `tests/dashboard.test.js` (add describe blocks)

- [ ] **Step 1: Write the failing tests**

Append to `tests/dashboard.test.js`:

```javascript
describe('GET / — break/lunch/leave/emergency enrichment', () => {
  function setup(over = false) {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: [
        { name: 'Maria Cruz', email: 'maria@x.com', job_role: 'Dev', status: 'Active' },
        { name: 'Leo Tan',    email: 'leo@x.com',   job_role: 'QA',  status: 'Active' },
      ] });
      if (t === 'attendance') return builder({ data: [
        { email: 'maria@x.com', clock_in: '09:00:00', clock_out: '', late_status: 'ON TIME', status: 'Approved', emergency: false },
        { email: 'leo@x.com',   clock_in: '09:05:00', clock_out: '', late_status: 'ON TIME', status: 'Approved', emergency: true, emergency_reason: 'Family' },
      ] });
      if (t === 'break_log') return builder({ data: [
        // Maria: open break (in progress), plus a completed one of 200s (or 1000s when over).
        { name: 'Maria Cruz', break_out: '10:30:00', break_in: '', duration_secs: 0 },
        { name: 'Maria Cruz', break_out: '09:30:00', break_in: '09:33:20', duration_secs: over ? 1000 : 200 },
      ] });
      if (t === 'lunch_log') return builder({ data: [
        // Leo: open lunch.
        { name: 'Leo Tan', lunch_out: '12:00:00', lunch_in: '', duration_secs: 0 },
      ] });
      if (t === 'leave_log') return builder({ data: [] }); // both Pending and Approved-today calls
      return builder({ data: [] });
    });
  }

  test('per-member break/lunch fields are computed', async () => {
    setup();
    const res = await request(makeApp()).get('/');
    const maria = res.body.members.find(m => m.email === 'maria@x.com');
    const leo   = res.body.members.find(m => m.email === 'leo@x.com');
    expect(maria.onBreak).toBe(true);
    expect(maria.breakStart).toBe('10:30:00');
    expect(maria.breakUsedSecs).toBe(200);
    expect(leo.onLunch).toBe(true);
    expect(leo.lunchStart).toBe('12:00:00');
  });

  test('summary includes onBreak/onLunch/overBudget/onLeave/emergency counts', async () => {
    setup();
    const res = await request(makeApp()).get('/');
    expect(res.body.summary.onBreak).toBe(1);
    expect(res.body.summary.onLunch).toBe(1);
    expect(res.body.summary.emergency).toBe(1);
    expect(res.body.summary.overBudget).toBe(0);
  });

  test('overBudget counts completed usage beyond budget', async () => {
    setup(true); // Maria completed 1000s break > 900s budget
    const res = await request(makeApp()).get('/');
    expect(res.body.summary.overBudget).toBe(1);
  });

  test('payload exposes budgets', async () => {
    setup();
    const res = await request(makeApp()).get('/');
    expect(res.body.budgets).toEqual({ breakSecs: 900, lunchSecs: 3600 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/dashboard.test.js -t "enrichment" 2>&1 | tail -25`
Expected: FAIL — `maria.onBreak` is undefined; `res.body.summary.onBreak` undefined; `res.body.budgets` undefined.

- [ ] **Step 3: Update the import**

In `routes/dashboard.js` line 3:

```javascript
const { todayJSTISO, BREAK_BUDGET_SECS, LUNCH_BUDGET_SECS } = require('../lib/rules');
```

- [ ] **Step 4: Extend the Promise.all block**

Replace the destructuring + `Promise.all([...])` (currently `routes/dashboard.js:13-23`) with:

```javascript
  const [
    { data: todayAtt },
    { data: allUsers },
    { data: pendingAtt },
    { data: pendingLeave },
    { data: breakRows },
    { data: lunchRows },
    { data: approvedLeave },
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('date', today),
    supabase.from('users').select('*').eq('role', 'member').eq('status', 'Active'),
    supabase.from('attendance').select('*').eq('status', 'Pending'),
    supabase.from('leave_log').select('*').eq('status', 'Pending'),
    supabase.from('break_log').select('*').eq('date', today),
    supabase.from('lunch_log').select('*').eq('date', today),
    supabase.from('leave_log').select('*').eq('status', 'Approved').eq('date', today),
  ]);

  const att     = todayAtt || [];
  const members = allUsers || [];
  const breaks  = breakRows || [];
  const lunches = lunchRows || [];
  const leaves  = approvedLeave || [];
```

(Delete the old `const att = todayAtt || [];` and `const members = allUsers || [];` lines at the former `routes/dashboard.js:25-26` — they are now part of the block above.)

- [ ] **Step 5: Enrich the member map**

In the `members.map(m => { ... })` block, after the existing `status` computation and before the `return {`, add:

```javascript
    const myBreaks = breaks.filter(b => b.name === m.name);
    const openBreak = myBreaks.find(b => !b.break_in || b.break_in === '');
    const breakUsedSecs = myBreaks
      .filter(b => b.break_in && b.break_in !== '')
      .reduce((sum, b) => sum + (b.duration_secs || 0), 0);

    const myLunches = lunches.filter(l => l.name === m.name);
    const openLunch = myLunches.find(l => !l.lunch_in || l.lunch_in === '');
    const lunchUsedSecs = myLunches
      .filter(l => l.lunch_in && l.lunch_in !== '')
      .reduce((sum, l) => sum + (l.duration_secs || 0), 0);

    const leaveRec = leaves.find(lv => lv.email === m.email);
```

Then extend the returned object (the existing `return { ... }`) with these fields after `emergencyReason`:

```javascript
      onBreak:       !!openBreak,
      breakStart:    openBreak?.break_out || null,
      breakUsedSecs,
      onLunch:       !!openLunch,
      lunchStart:    openLunch?.lunch_out || null,
      lunchUsedSecs,
      onLeave:       !!leaveRec,
      leaveType:     leaveRec?.leave_type || null,
```

- [ ] **Step 6: Extend the summary and response**

Replace the `const summary = { ... };` block with:

```javascript
  const isOver = (m) => m.breakUsedSecs > BREAK_BUDGET_SECS || m.lunchUsedSecs > LUNCH_BUDGET_SECS;

  const summary = {
    clockedIn:  membersWithStatus.filter(m => m.status === 'CLOCKED IN' || m.status === 'CLOCKED IN (LATE)').length,
    clockedOut: membersWithStatus.filter(m => m.status === 'CLOCKED OUT').length,
    notIn:      membersWithStatus.filter(m => m.status === 'NOT CLOCKED IN').length,
    pending:    membersWithStatus.filter(m => m.status === 'PENDING APPROVAL').length,
    total:      members.length,
    onBreak:    membersWithStatus.filter(m => m.onBreak).length,
    onLunch:    membersWithStatus.filter(m => m.onLunch).length,
    overBudget: membersWithStatus.filter(isOver).length,
    onLeave:    membersWithStatus.filter(m => m.onLeave).length,
    emergency:  membersWithStatus.filter(m => m.emergency).length,
  };
```

In the `res.json({ ... })`, add after `date: today,`:

```javascript
    budgets: { breakSecs: BREAK_BUDGET_SECS, lunchSecs: LUNCH_BUDGET_SECS },
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest tests/dashboard.test.js 2>&1 | tail -25`
Expected: PASS (all describe blocks, including Task 1's).

- [ ] **Step 8: Run the full backend suite (no regressions)**

Run: `npx jest 2>&1 | tail -15`
Expected: all suites pass.

- [ ] **Step 9: Commit**

```bash
git add routes/dashboard.js tests/dashboard.test.js
git commit -m "feat: dashboard reports live break/lunch, on-leave, emergency + budgets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend types — extend DashboardData

**Files:**
- Modify: `frontend/components/admin/AdminDashboard.tsx:42-65`

- [ ] **Step 1: Extend the `summary` and `members` types**

In `frontend/components/admin/AdminDashboard.tsx`, replace the `summary` field of `DashboardData` (currently lines 44-50) with:

```typescript
  summary: {
    clockedIn: number;
    clockedOut: number;
    notIn: number;
    pending: number;
    total: number;
    onBreak: number;
    onLunch: number;
    overBudget: number;
    onLeave: number;
    emergency: number;
  };
```

Replace the `members` array element type (currently lines 51-62) with:

```typescript
  members: {
    name: string;
    email: string;
    role: string;
    status: string;
    clockIn: string;
    clockOut: string;
    totalHours: number | string;
    lateStatus: string;
    emergency?: boolean;
    emergencyReason?: string | null;
    onBreak?: boolean;
    breakStart?: string | null;
    breakUsedSecs?: number;
    onLunch?: boolean;
    lunchStart?: string | null;
    lunchUsedSecs?: number;
    onLeave?: boolean;
    leaveType?: string | null;
  }[];
```

Add a `budgets` field to `DashboardData` after `pendingLeave` (before the closing `}`):

```typescript
  budgets?: { breakSecs: number; lunchSecs: number };
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/AdminDashboard.tsx
git commit -m "types: extend DashboardData with live break/lunch/leave fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — live `OutChip` + "On lunch / break" panel

**Files:**
- Modify: `frontend/components/admin/pages/AttendancePage.tsx` (helpers, sub-components, panels)
- Note: `dashboard` prop type comes from `AdminDashboard.tsx` (Task 3).

- [ ] **Step 1: Add JST time helpers**

In `frontend/components/admin/pages/AttendancePage.tsx`, after the `initials` function (around line 42), add:

```typescript
/** Seconds-of-day for the current JST wall clock. */
function jstNowSecs(): number {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/** Parse "HH:MM:SS" into seconds-of-day. */
function parseHmsSecs(hms: string): number {
  const [h, m, s] = hms.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}
```

- [ ] **Step 2: Import `useEffect`**

Change the React import at `frontend/components/admin/pages/AttendancePage.tsx:3` from:

```typescript
import { useState } from 'react';
```

to:

```typescript
import { useState, useEffect } from 'react';
```

- [ ] **Step 3: Add the `OutChip` component**

After the `PersonChip` component (around line 142), add:

```tsx
interface OutChipProps {
  name: string;
  kind: 'break' | 'lunch';
  start: string;        // "HH:MM:SS" JST
  usedSecs: number;     // completed sessions today
  budgetSecs: number;
}
function OutChip({ name, kind, start, usedSecs, budgetSecs }: OutChipProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, jstNowSecs() - parseHmsSecs(start));
  const over = usedSecs + elapsed > budgetSecs;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const tint = over ? C.red : (kind === 'lunch' ? C.blue : C.accent);
  const init = initials(name);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '6px 12px 6px 6px', background: C.surface2, border: `1px solid ${over ? C.redBorder : C.border}`, borderRadius: 999 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: `${tint}22`, color: tint, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{init}</span>
      <span style={{ fontFamily: F_SANS, fontSize: 12, color: C.text, fontWeight: 500 }}>{name}</span>
      <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: tint, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>
        on {kind} {mm}:{ss}
      </span>
      {over && (
        <span style={{ fontFamily: F_MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: C.red, background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 6, padding: '2px 6px' }}>
          OVER
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace the faked "Clocked in / active" panel's data + add the lunch/break panel**

Replace the comment + `clockedInMembers` definition (currently lines 218-219) — the `clockedInMembers` variable is removed because the only panel that used it is being replaced here:

```typescript
  // Panel: members currently out on lunch or break (live timers).
  const outMembers = members.filter(m => m.onBreak || m.onLunch);
  const budgets = dashboard?.budgets ?? { breakSecs: 900, lunchSecs: 3600 };
```

Then in the panels grid (currently `frontend/components/admin/pages/AttendancePage.tsx:325-354`), replace the first `<PanelCard title="Clocked in / active" ...>` with a lunch/break panel, keeping the "Not clocked in yet" panel as the second cell:

```tsx
        <PanelCard title="On lunch / break" count={outMembers.length} alert={outMembers.some(m => (m.breakUsedSecs ?? 0) > budgets.breakSecs || (m.lunchUsedSecs ?? 0) > budgets.lunchSecs)}>
          {outMembers.length === 0 ? (
            <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>Nobody on lunch or break</span>
          ) : (
            outMembers.map((m) => (
              m.onLunch ? (
                <OutChip key={`${m.email}-l`} name={m.name} kind="lunch" start={m.lunchStart || '00:00:00'} usedSecs={m.lunchUsedSecs ?? 0} budgetSecs={budgets.lunchSecs} />
              ) : (
                <OutChip key={`${m.email}-b`} name={m.name} kind="break" start={m.breakStart || '00:00:00'} usedSecs={m.breakUsedSecs ?? 0} budgetSecs={budgets.breakSecs} />
              )
            ))
          )}
        </PanelCard>
```

(The second panel, "Not clocked in yet", is unchanged. The old "Clocked in / active" panel — the only consumer of `clockedInMembers` — is fully replaced by the block above.)

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/admin/pages/AttendancePage.tsx
git commit -m "feat: live lunch/break panel with ticking timers + over badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Frontend — 5-card stat row (real On leave + Over budget)

**Files:**
- Modify: `frontend/components/admin/pages/AttendancePage.tsx` (stat row, lines ~288-322)

- [ ] **Step 1: Change the stat grid to 5 columns and wire real data**

Replace the stat-row block (`<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>` … through its closing `</div>` at `frontend/components/admin/pages/AttendancePage.tsx:288-322`) with:

```tsx
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <StatCard
          label="Present today"
          value={String(presentCount)}
          sub={<>of {total} · <b style={{ color: C.text2 }}>{total - presentCount}</b> remaining</>}
          icon="●"
          tint={C.green}
          trend={`${presentCount} clocked in`}
        />
        <StatCard
          label="Late entry"
          value={String(lateCount)}
          sub={<>others <b style={{ color: C.text2 }}>on time</b></>}
          icon="⚠"
          tint={C.accent}
          trend={lateCount === 0 ? 'No late entries' : `${lateCount} late today`}
        />
        <StatCard
          label="On leave"
          value={String(summary.onLeave ?? 0)}
          sub={<>approved today</>}
          icon="✦"
          tint={C.purple}
          trend={(summary.onLeave ?? 0) === 0 ? 'Nobody on leave' : `${summary.onLeave} on leave`}
        />
        <StatCard
          label="Over budget"
          value={String(summary.overBudget ?? 0)}
          sub={<>break / lunch</>}
          icon="◷"
          tint={C.red}
          trend={(summary.overBudget ?? 0) > 0 ? 'Over allowance' : 'Within budget'}
          trendAlert={(summary.overBudget ?? 0) > 0}
        />
        <StatCard
          label="Absent"
          value={String(absentCount)}
          sub={<>not clocked in</>}
          icon="●"
          tint={C.red}
          trend={absentCount > 0 ? 'Action needed' : 'All accounted for'}
          trendAlert={absentCount > 0}
        />
      </div>
```

Note: `summary` already includes the new fields via the type update in Task 3; the `?? 0` guards a null `dashboard`.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/pages/AttendancePage.tsx
git commit -m "feat: real On-leave stat + Over-budget stat card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Frontend — Emergency panel + final verification

**Files:**
- Modify: `frontend/components/admin/pages/AttendancePage.tsx` (panels area)

- [ ] **Step 1: Compute emergency members**

After the `outMembers` / `budgets` lines added in Task 4 (around line 219), add:

```typescript
  // Panel: members who emergency-clocked-out today.
  const emergencyMembers = members.filter(m => m.emergency);
```

- [ ] **Step 2: Add the Emergency panel below the existing panels grid**

Immediately after the panels-grid `</div>` (the grid that holds "On lunch / break" and "Not clocked in yet", ending around line 354), add a conditional panel:

```tsx
      {emergencyMembers.length > 0 && (
        <PanelCard title="Emergency clock-outs" count={emergencyMembers.length} alert>
          {emergencyMembers.map((m) => (
            <div key={m.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '6px 12px 6px 6px', background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 999 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(220,38,38,0.18)', color: C.red, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(m.name)}</span>
              <span style={{ fontFamily: F_SANS, fontSize: 12, color: C.text, fontWeight: 500 }}>{m.name}</span>
              <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.red, letterSpacing: '0.02em' }}>{m.emergencyReason || 'Emergency'}</span>
            </div>
          ))}
        </PanelCard>
      )}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: clean.

- [ ] **Step 4: Full backend suite (final guard)**

Run: `npx jest 2>&1 | tail -15`
Expected: all suites pass.

- [ ] **Step 5: Visual verification (playwright-cli)**

Use the playwright-cli skill to log in as owner, open the admin Attendance page, and confirm:
- A clocked-in member shows as Present (not Absent).
- A member on break appears in "On lunch / break" with a ticking timer.
- Screenshot saved for review.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/admin/pages/AttendancePage.tsx
git commit -m "feat: emergency clock-out panel on admin attendance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification Before Completion

- `npx jest` — full backend suite green (was 342 tests; this adds ~5).
- `cd frontend && npx tsc --noEmit` — clean.
- Manual/playwright: clocked-in member is Present; on-break member shows ticking timer; exceeding 15 min shows OVER badge and increments the Over-budget stat; emergency clock-out appears in the Emergency panel.
- Push to `origin/main` so Vercel + Render auto-deploy (per project workflow).

## Notes / Open Detail

- **`leave_log` date format:** leave is submitted from an `<input type="date">`, so `date` is ISO `YYYY-MM-DD` — matched by `todayJSTISO()`. If a real approved-leave row does not appear in the On-leave stat during verification, inspect one `leave_log` row's `date` value and adjust the match accordingly (single-date assumption; ranges are out of scope).
- The AttendancePage header still reads "Auto-refresh · 30s" while the actual interval is 15s (`AdminDashboard.tsx:153`). Not in scope; leave as-is unless asked.
