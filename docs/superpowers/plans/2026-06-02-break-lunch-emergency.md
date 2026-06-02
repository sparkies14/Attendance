# Member Lunch/Break Overhaul + Emergency Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple lunch/break toggles with budgeted, live-countdown timers (break 15 min resumable, lunch 60 min single-use, both soft-overrun in red) and add an Emergency button (reason dropdown + free-text) that clocks out, flags the record, and alerts admin.

**Architecture:** Second-precision durations in `break_log`/`lunch_log` (multiple break rows/day, one lunch row), an `emergency`+`emergency_reason` flag on `attendance`. Backend actions in `routes/attendance.js` plus aggregation in `routes/memberData.js`. The client computes countdowns from server-provided used-seconds + open-session start (JST), ticking each second.

**Tech Stack:** Node/Express + Supabase (backend), Jest + supertest (tests), Next.js 15 / React 19 / TS (frontend), Discord webhook for alerts.

---

## File Structure

- **Create** `migrations/020_add_duration_secs.sql`, `migrations/021_add_emergency_to_attendance.sql` (run manually in Supabase).
- **Modify** `lib/rules.js` — add `timeToSeconds(HH:MM:SS)`.
- **Modify** `routes/attendance.js` — rewrite break/lunch handlers (multi-session, secs), add `emergency`.
- **Modify** `routes/memberData.js` — multi-row break aggregation + new response fields.
- **Modify** `frontend/components/member/pages/HomePage.tsx` — countdown timers, lunch single-use, emergency button + reason modal.
- **Modify** `frontend/components/member/MemberDashboard.tsx` — extend `MemberData` type with new fields.
- **Modify** an admin attendance view to show the 🚨 emergency badge (file identified in Task 9).
- **Tests:** `tests/rules.test.js` (extend), `tests/attendanceBreakLunch.test.js` (new), `tests/attendanceEmergency.test.js` (new).

Backend tests: `npx jest`. Frontend type-check: `cd frontend && npx tsc --noEmit`.

---

## Task 1: Migrations

**Files:** Create `migrations/020_add_duration_secs.sql`, `migrations/021_add_emergency_to_attendance.sql`

- [ ] **Step 1: Create `migrations/020_add_duration_secs.sql`**

```sql
-- Second-level precision for break/lunch durations.
alter table break_log add column if not exists duration_secs integer not null default 0;
alter table lunch_log add column if not exists duration_secs integer not null default 0;
```

- [ ] **Step 2: Create `migrations/021_add_emergency_to_attendance.sql`**

```sql
-- Emergency exit flag + reason on the attendance record.
alter table attendance add column if not exists emergency boolean not null default false;
alter table attendance add column if not exists emergency_reason text;
```

- [ ] **Step 3: Commit**

```bash
git add migrations/020_add_duration_secs.sql migrations/021_add_emergency_to_attendance.sql
git commit -m "feat: migrations for break/lunch duration_secs and attendance emergency flag"
```

- [ ] **Step 4: Flag for the user** — both must be run in the Supabase SQL Editor before the feature works. Note in final summary.

---

## Task 2: `timeToSeconds` helper

**Files:** Modify `lib/rules.js`, Test `tests/rules.test.js`

- [ ] **Step 1: Add the failing test** — append to `tests/rules.test.js`:

```javascript
const { timeToSeconds } = require('../lib/rules');

describe('timeToSeconds', () => {
  test('parses HH:MM:SS to seconds of day', () => {
    expect(timeToSeconds('00:00:00')).toBe(0);
    expect(timeToSeconds('00:00:45')).toBe(45);
    expect(timeToSeconds('01:02:03')).toBe(3723);
    expect(timeToSeconds('13:30:00')).toBe(48600);
  });
  test('treats missing seconds as 0', () => {
    expect(timeToSeconds('09:05')).toBe(32700);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx jest tests/rules.test.js` (timeToSeconds undefined).

- [ ] **Step 3: Implement** — in `lib/rules.js`, add the function and export it:

```javascript
function timeToSeconds(timeStr) {
  const [h = 0, m = 0, s = 0] = String(timeStr).split(':').map(Number);
  return (h * 3600) + (m * 60) + s;
}
```

Add `timeToSeconds` to the `module.exports` object.

- [ ] **Step 4: Run → PASS** — `npx jest tests/rules.test.js`.

- [ ] **Step 5: Commit**

```bash
git add lib/rules.js tests/rules.test.js
git commit -m "feat: add timeToSeconds helper for second-precision durations"
```

---

## Task 3: Break handlers — multi-session + duration_secs

**Files:** Modify `routes/attendance.js`, Test `tests/attendanceBreakLunch.test.js`

- [ ] **Step 1: Write the failing test** — create `tests/attendanceBreakLunch.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));
jest.mock('../lib/discord', () => ({ sendMessage: jest.fn().mockResolvedValue(undefined), CHANNELS: {} }));

const supabase = require('../lib/supabase');
const router = require('../routes/attendance');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/webhook/attendance', router);
  return app;
}
const token = () => signToken({ user_id: 'u1', email: 'm@x.com', role: 'member' });

// Generic chainable builder; terminal ops resolve `result`.
function builder(result) {
  const b = {};
  ['select','insert','update','delete','eq','order','gte','lte','in'].forEach(m => b[m] = jest.fn(() => b));
  b.maybeSingle = jest.fn(() => Promise.resolve(result));
  b.then = (r) => r(result);
  return b;
}

const ACTIVE_USER = { name: 'Maria Cruz', job_role: 'member', status: 'Active' };

beforeEach(() => { jest.clearAllMocks(); });

describe('break-out / break-in (multi-session, secs)', () => {
  test('break-out inserts a new open break_log row', async () => {
    const insertBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      return insertBuilder; // break_log
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'break-out', local_time: '10:00:00', date: '2026-06-02' });
    expect(res.status).toBe(200);
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Maria Cruz', date: '2026-06-02', break_out: '10:00:00', break_in: '', duration_secs: 0,
    }));
  });

  test('break-in closes the open row with duration_secs', async () => {
    const updateBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      // break_log: select open row → return one open row; update → capture
      const b = builder({ data: [{ id: 7, break_out: '10:00:00', break_in: '' }] });
      b.update = updateBuilder.update;
      return b;
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'break-in', local_time: '10:03:30', date: '2026-06-02' });
    expect(res.status).toBe(200);
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      break_in: '10:03:30', duration_secs: 210,
    }));
  });

  test('break-in with no open row → 400', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      return builder({ data: [] });
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'break-in', local_time: '10:03:30', date: '2026-06-02' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx jest tests/attendanceBreakLunch.test.js` (current code uses `duration_mins` + maybeSingle).

- [ ] **Step 3: Replace the break handlers** in `routes/attendance.js`. First ensure `timeToSeconds` is imported — change the rules import line to include it:

```javascript
const { classifyLateStatus, timeToMinutes, calcRawHours, timeToSeconds } = require('../lib/rules');
```

Replace the existing `if (action === 'break-out')` and `if (action === 'break-in')` blocks with:

```javascript
  if (action === 'break-out') {
    // Guard: must not already have an open break session today.
    const { data: openRows } = await supabase
      .from('break_log').select('id').eq('name', officialName).eq('date', date).eq('break_in', '');
    if (openRows && openRows.length > 0) {
      return res.status(400).json({ error: 'You already have an open break.' });
    }
    const { error } = await supabase.from('break_log').insert({
      name: officialName, date, break_out: local_time, break_in: '', duration_secs: 0,
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Break out recorded!' });
  }

  if (action === 'break-in') {
    const { data: openRows } = await supabase
      .from('break_log').select('id, break_out').eq('name', officialName).eq('date', date).eq('break_in', '');
    const breakRow = openRows && openRows[0];
    if (!breakRow) return res.status(400).json({ error: 'No open break to return from.' });
    const duration_secs = Math.max(0, timeToSeconds(local_time) - timeToSeconds(breakRow.break_out));
    const { error } = await supabase.from('break_log')
      .update({ break_in: local_time, duration_secs }).eq('id', breakRow.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Break in recorded!' });
  }
```

- [ ] **Step 4: Run → PASS** — `npx jest tests/attendanceBreakLunch.test.js`.

- [ ] **Step 5: Commit**

```bash
git add routes/attendance.js tests/attendanceBreakLunch.test.js
git commit -m "feat: multi-session break with second-precision durations"
```

---

## Task 4: Lunch handlers — single-use + duration_secs

**Files:** Modify `routes/attendance.js`, Test `tests/attendanceBreakLunch.test.js` (extend)

- [ ] **Step 1: Add failing tests** — append to `tests/attendanceBreakLunch.test.js`:

```javascript
describe('lunch-out / lunch-in (single-use, secs)', () => {
  test('lunch-out inserts when no lunch yet', async () => {
    const insertBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      const b = builder({ data: [] }); // no existing lunch rows
      b.insert = insertBuilder.insert;
      return b;
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'lunch-out', local_time: '12:00:00', date: '2026-06-02' });
    expect(res.status).toBe(200);
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Maria Cruz', date: '2026-06-02', lunch_out: '12:00:00', lunch_in: '', duration_secs: 0,
    }));
  });

  test('lunch-out rejected when lunch already consumed', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      return builder({ data: [{ id: 1, lunch_out: '12:00:00', lunch_in: '12:55:00' }] });
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'lunch-out', local_time: '14:00:00', date: '2026-06-02' });
    expect(res.status).toBe(400);
  });

  test('lunch-in closes open lunch with duration_secs', async () => {
    const updateBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      const b = builder({ data: [{ id: 5, lunch_out: '12:00:00', lunch_in: '' }] });
      b.update = updateBuilder.update;
      return b;
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'lunch-in', local_time: '12:55:10', date: '2026-06-02' });
    expect(res.status).toBe(200);
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      lunch_in: '12:55:10', duration_secs: 3310,
    }));
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx jest tests/attendanceBreakLunch.test.js`.

- [ ] **Step 3: Replace the lunch handlers** in `routes/attendance.js`. Replace the existing `if (action === 'lunch-out')` and `if (action === 'lunch-in')` blocks with:

```javascript
  if (action === 'lunch-out') {
    const { data: rows } = await supabase
      .from('lunch_log').select('id, lunch_in').eq('name', officialName).eq('date', date);
    if (rows && rows.length > 0) {
      // Either an open lunch, or one already consumed today — both block a new lunch-out.
      const consumed = rows.some(r => r.lunch_in && r.lunch_in !== '');
      return res.status(400).json({ error: consumed ? 'Lunch already taken today.' : 'You are already on lunch.' });
    }
    const { error } = await supabase.from('lunch_log').insert({
      name: officialName, date, lunch_out: local_time, lunch_in: '', duration_secs: 0,
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Lunch out recorded!' });
  }

  if (action === 'lunch-in') {
    const { data: rows } = await supabase
      .from('lunch_log').select('id, lunch_out, lunch_in').eq('name', officialName).eq('date', date);
    const lunchRow = (rows || []).find(r => !r.lunch_in || r.lunch_in === '');
    if (!lunchRow) return res.status(400).json({ error: 'No open lunch to return from.' });
    const duration_secs = Math.max(0, timeToSeconds(local_time) - timeToSeconds(lunchRow.lunch_out));
    const { error } = await supabase.from('lunch_log')
      .update({ lunch_in: local_time, duration_secs }).eq('id', lunchRow.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Lunch in recorded!' });
  }
```

- [ ] **Step 4: Run → PASS** — `npx jest tests/attendanceBreakLunch.test.js`.

- [ ] **Step 5: Commit**

```bash
git add routes/attendance.js tests/attendanceBreakLunch.test.js
git commit -m "feat: single-use lunch with second-precision duration"
```

---

## Task 5: Emergency action

**Files:** Modify `routes/attendance.js`, Test `tests/attendanceEmergency.test.js`

- [ ] **Step 1: Write the failing test** — create `tests/attendanceEmergency.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));
const mockSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/discord', () => ({ sendMessage: mockSend, CHANNELS: { clockLogs: 'c1' } }));

const supabase = require('../lib/supabase');
const router = require('../routes/attendance');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/webhook/attendance', router);
  return app;
}
const token = () => signToken({ user_id: 'u1', email: 'm@x.com', role: 'member' });

function builder(result) {
  const b = {};
  ['select','insert','update','delete','eq','order','gte','lte','in'].forEach(m => b[m] = jest.fn(() => b));
  b.maybeSingle = jest.fn(() => Promise.resolve(result));
  b.then = (r) => r(result);
  return b;
}
const ACTIVE_USER = { name: 'Maria Cruz', job_role: 'member', status: 'Active' };

beforeEach(() => { jest.clearAllMocks(); });

describe('emergency action', () => {
  test('400 when reason missing', async () => {
    supabase.from.mockImplementation(() => builder({ data: ACTIVE_USER }));
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'emergency', local_time: '14:00:00', date: '2026-06-02' });
    expect(res.status).toBe(400);
  });

  test('clocks out, sets emergency + reason, alerts admin', async () => {
    const updateBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      // attendance: select open row → return one; update → capture
      const b = builder({ data: { id: 9, clock_in: '09:00:00', clock_out: '', last_clock_in: '09:00:00', accumulated_hours: 0 } });
      b.update = updateBuilder.update;
      return b;
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'emergency', local_time: '14:00:00', date: '2026-06-02', reason: 'Family emergency' });
    expect(res.status).toBe(200);
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      clock_out: '14:00:00', emergency: true, emergency_reason: 'Family emergency', status: 'Approved',
    }));
    expect(mockSend).toHaveBeenCalled();
    expect(mockSend.mock.calls[0][1]).toMatch(/EMERGENCY/i);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx jest tests/attendanceEmergency.test.js` (no emergency action).

- [ ] **Step 3: Add the emergency handler** in `routes/attendance.js`, immediately after the `if (action === 'clock-out') { ... }` block:

```javascript
  if (action === 'emergency') {
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'An emergency reason is required.' });
    }
    const { data: row } = await supabase
      .from('attendance')
      .select('id, clock_in, clock_out, last_clock_in, accumulated_hours')
      .eq('email', email).eq('date', date).maybeSingle();
    if (!row) return res.status(400).json({ error: 'No clock-in record found for today.' });
    if (row.clock_out && row.clock_out !== '') {
      return res.status(400).json({ error: 'You have already clocked out today.' });
    }
    const segmentFrom = row.last_clock_in || row.clock_in;
    const current_raw_hours = calcRawHours(segmentFrom, local_time);
    const total_raw_hours = (row.accumulated_hours || 0) + current_raw_hours;
    const total_hours = Math.max(0, Math.round((total_raw_hours - 1) * 100) / 100);

    const { error } = await supabase.from('attendance')
      .update({ clock_out: local_time, total_hours, status: 'Approved', emergency: true, emergency_reason: String(reason).trim() })
      .eq('id', row.id);
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.clockLogs,
      `🚨 **EMERGENCY** — ${officialName} | ${date} ${local_time} | ${String(reason).trim()}`);
    return res.json({ success: true, message: 'Emergency exit recorded. Stay safe.' });
  }
```

- [ ] **Step 4: Run → PASS** — `npx jest tests/attendanceEmergency.test.js`.

- [ ] **Step 5: Commit**

```bash
git add routes/attendance.js tests/attendanceEmergency.test.js
git commit -m "feat: add emergency action (clock out + flag + admin alert)"
```

---

## Task 6: member-data aggregation + new fields

**Files:** Modify `routes/memberData.js`

- [ ] **Step 1: Read** `routes/memberData.js` to confirm the current `lunchToday`/`breakToday` `.maybeSingle()` queries (around lines 35-36) and the `res.json({...})` block (around lines 100-117).

- [ ] **Step 2: Change the break/lunch queries to multi-row.** In the `Promise.all([...])`, replace the two lines:

```javascript
    supabase.from('lunch_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
    supabase.from('break_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
```

with (note variable rename to plural arrays):

```javascript
    supabase.from('lunch_log').select('*').eq('name', officialName).eq('date', today),
    supabase.from('break_log').select('*').eq('name', officialName).eq('date', today),
```

And update the destructured names accordingly: change `{ data: lunchToday }` → `{ data: lunchRows }` and `{ data: breakToday }` → `{ data: breakRows }`.

- [ ] **Step 3: Derive aggregates** just before the `res.json({...})` call:

```javascript
  const BREAK_BUDGET_SECS = 900;   // 15 min
  const LUNCH_BUDGET_SECS = 3600;  // 60 min

  const breaks = breakRows || [];
  const openBreak = breaks.find(b => !b.break_in || b.break_in === '');
  const breakUsedSecs = breaks
    .filter(b => b.break_in && b.break_in !== '')
    .reduce((sum, b) => sum + (b.duration_secs || 0), 0);

  const lunches = lunchRows || [];
  const openLunch = lunches.find(l => !l.lunch_in || l.lunch_in === '');
  const lunchUsedSecs = lunches
    .filter(l => l.lunch_in && l.lunch_in !== '')
    .reduce((sum, l) => sum + (l.duration_secs || 0), 0);
  const lunchConsumed = lunches.some(l => l.lunch_in && l.lunch_in !== '');
```

- [ ] **Step 4: Replace the lunch/break fields** in the `res.json({...})` block. Replace the existing `onLunch`/`onBreak`/`hadLunch`/`lunchStart`/`lunchEnd`/`breakStart`/`breakEnd` lines with:

```javascript
    onLunch:    !!openLunch,
    onBreak:    !!openBreak,
    hadLunch:   lunchConsumed,
    lunchStart: openLunch?.lunch_out || null,
    lunchEnd:   null,
    breakStart: openBreak?.break_out || null,
    breakEnd:   null,
    // budgeted-timer fields
    breakBudgetSecs: BREAK_BUDGET_SECS,
    breakUsedSecs,
    lunchBudgetSecs: LUNCH_BUDGET_SECS,
    lunchUsedSecs,
    lunchConsumed,
```

- [ ] **Step 5: Sanity check** — run the full backend suite to ensure nothing else referenced the removed single-row vars: `npx jest`. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add routes/memberData.js
git commit -m "feat: member-data aggregates break/lunch usage + budget fields"
```

---

## Task 7: Frontend — MemberData type + countdown timers

**Files:** Modify `frontend/components/member/MemberDashboard.tsx`, `frontend/components/member/pages/HomePage.tsx`

- [ ] **Step 1: Extend the `MemberData` type.** In `frontend/components/member/MemberDashboard.tsx`, find `export interface MemberData {` and add these optional fields (keep existing ones):

```tsx
  breakBudgetSecs?: number;
  breakUsedSecs?: number;
  lunchBudgetSecs?: number;
  lunchUsedSecs?: number;
  lunchConsumed?: boolean;
```

- [ ] **Step 2: Read** `frontend/components/member/pages/HomePage.tsx` to confirm: the `getJST()` helper (returns `{ date, time, hour, minute, second }`), the `time` const (`HH:MM`), `doAction`, `lunchToggle`/`breakToggle`/`clockOut`, the `ActionBtn` usages (~lines 435-441), and the state setters from member-data (`setOnLunch`, `setOnBreak`, `setLunchStart`, `setBreakStart`, etc.).

- [ ] **Step 3: Add a seconds-precision time + new state.** In `getJST()` (around line 45), add a seconds field next to `time`:

```tsx
    time: `${String(jst.getHours()).padStart(2,'0')}:${String(jst.getMinutes()).padStart(2,'0')}`,
    timeSecs: `${String(jst.getHours()).padStart(2,'0')}:${String(jst.getMinutes()).padStart(2,'0')}:${String(jst.getSeconds()).padStart(2,'0')}`,
```

Add new state with the other `useState` calls:

```tsx
  const [breakBudget, setBreakBudget] = useState(memberData?.breakBudgetSecs ?? 900);
  const [breakUsed,   setBreakUsed]   = useState(memberData?.breakUsedSecs ?? 0);
  const [lunchBudget, setLunchBudget] = useState(memberData?.lunchBudgetSecs ?? 3600);
  const [lunchUsed,   setLunchUsed]   = useState(memberData?.lunchUsedSecs ?? 0);
  const [lunchConsumed, setLunchConsumed] = useState(memberData?.lunchConsumed ?? false);
  const [tick, setTick] = useState(0); // forces re-render each second for countdowns
```

In the member-data refresh handler (where `setOnLunch(d.onLunch)` etc. are set), also set:

```tsx
        setBreakBudget(d.breakBudgetSecs ?? 900);
        setBreakUsed(d.breakUsedSecs ?? 0);
        setLunchBudget(d.lunchBudgetSecs ?? 3600);
        setLunchUsed(d.lunchUsedSecs ?? 0);
        setLunchConsumed(d.lunchConsumed ?? false);
```

- [ ] **Step 4: Add a 1-second ticker** (only while on break or lunch). Add an effect near the other effects:

```tsx
  useEffect(() => {
    if (!onBreak && !onLunch) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [onBreak, onLunch]);
```

- [ ] **Step 5: Add remaining-time helpers** (place above the `return`):

```tsx
  // elapsed seconds of the currently open session, from its HH:MM:SS start in JST
  function openElapsed(startHHMMSS: string | null): number {
    if (!startHHMMSS) return 0;
    const j = getJST();
    const [h, m, s] = startHHMMSS.split(':').map(Number);
    const startSecs = (h * 3600) + (m * 60) + (s || 0);
    const nowSecs = (j.hour * 3600) + (j.minute * 60) + j.second;
    return Math.max(0, nowSecs - startSecs);
  }
  function fmt(secs: number): string {
    const sign = secs < 0 ? '-' : '';
    const a = Math.abs(secs);
    return `${sign}${String(Math.floor(a / 60)).padStart(2,'0')}:${String(a % 60).padStart(2,'0')}`;
  }
  void tick; // referenced so the interval re-render is meaningful
  const breakRemaining = breakBudget - breakUsed - (onBreak ? openElapsed(breakStart) : 0);
  const lunchRemaining = lunchBudget - lunchUsed - (onLunch ? openElapsed(lunchStart) : 0);
```

- [ ] **Step 6: Send seconds-precision time for break/lunch/emergency.** Update the toggle functions:

```tsx
  function lunchToggle(){ const j = getJST(); doAction({ action: onLunch ? 'lunch-in' : 'lunch-out', local_time: j.timeSecs, date }); }
  function breakToggle(){ const j = getJST(); doAction({ action: onBreak ? 'break-in' : 'break-out', local_time: j.timeSecs, date }); }
```

- [ ] **Step 7: Update the Lunch & Break buttons** (the `ActionBtn` block ~lines 436-441). Replace with:

```tsx
                <ActionBtn onClick={lunchToggle} disabled={loading || (lunchConsumed && !onLunch)} active={onLunch} activeColor={C.accent}>
                  {onLunch
                    ? `🍱 On Lunch · ${fmt(lunchRemaining)}${lunchRemaining < 0 ? ' over' : ' left'}`
                    : lunchConsumed ? '🍱 Lunch taken' : '🍱 Lunch'}
                </ActionBtn>
                <ActionBtn onClick={breakToggle} disabled={loading} active={onBreak} activeColor={C.purple}>
                  {onBreak
                    ? `☕ On Break · ${fmt(breakRemaining)}${breakRemaining < 0 ? ' over' : ' left'}`
                    : `☕ Break · ${fmt(Math.max(0, breakRemaining))} left`}
                </ActionBtn>
```

To show overage in red, the `ActionBtn` uses `activeColor`; for over-budget pass red. Simplest: when `onLunch && lunchRemaining < 0` use `activeColor={C.red}` (and same for break). Implement by computing the color inline:

```tsx
                <ActionBtn onClick={lunchToggle} disabled={loading || (lunchConsumed && !onLunch)} active={onLunch} activeColor={onLunch && lunchRemaining < 0 ? C.red : C.accent}>
```
```tsx
                <ActionBtn onClick={breakToggle} disabled={loading} active={onBreak} activeColor={onBreak && breakRemaining < 0 ? C.red : C.purple}>
```

(Use the existing `C.red` constant; if absent, use `'#dc2626'`.)

- [ ] **Step 8: Type-check** — `cd frontend && npx tsc --noEmit` → exit 0.

- [ ] **Step 9: Commit**

```bash
git add frontend/components/member/MemberDashboard.tsx frontend/components/member/pages/HomePage.tsx
git commit -m "feat: live break/lunch countdown timers with overage on member page"
```

---

## Task 8: Frontend — Emergency button + reason modal

**Files:** Modify `frontend/components/member/pages/HomePage.tsx`

- [ ] **Step 1: Add emergency state** with the other `useState` calls:

```tsx
  const EMERGENCY_REASONS = ['Family emergency', 'Medical / health issue', 'Accident', 'Transportation / commute problem', 'Severe weather / disaster', 'Other'];
  const [showEmergency, setShowEmergency] = useState(false);
  const [emReason, setEmReason]   = useState(EMERGENCY_REASONS[0]);
  const [emOther,  setEmOther]    = useState('');
```

- [ ] **Step 2: Add the submit handler** near `clockOut`:

```tsx
  function submitEmergency() {
    const reason = emReason === 'Other' ? emOther.trim() : emReason;
    if (!reason) { setErr('Please describe the emergency.'); return; }
    const j = getJST();
    doAction({ action: 'emergency', local_time: j.timeSecs, date, reason });
    setShowEmergency(false); setEmOther('');
  }
```

- [ ] **Step 3: Add the Emergency button** next to Clock Out (after the `<ActionBtn onClick={clockOut} ... danger>Clock out</ActionBtn>` line ~435):

```tsx
                <ActionBtn onClick={() => setShowEmergency(true)} disabled={loading} danger>🚨 Emergency</ActionBtn>
```

- [ ] **Step 4: Add the reason modal** near the end of the returned JSX (before the outermost closing tag), rendered when `showEmergency`:

```tsx
      {showEmergency && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
             onClick={() => setShowEmergency(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 22, width: 360, maxWidth: '90vw', border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: F_SERIF, fontSize: 20, color: C.text, marginBottom: 10 }}>🚨 What&apos;s the emergency?</div>
            <select value={emReason} onChange={e => setEmReason(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, background: C.surface, color: C.text, marginBottom: 10 }}>
              {EMERGENCY_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {emReason === 'Other' && (
              <input value={emOther} onChange={e => setEmOther(e.target.value)} placeholder="Describe the emergency"
                style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, background: C.surface, color: C.text, marginBottom: 10, boxSizing: 'border-box' }} />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowEmergency(false)} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitEmergency} disabled={loading} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Confirm exit</button>
            </div>
          </div>
        </div>
      )}
```

(Use the file's existing `F_SERIF`/`C` constants; if `F_SERIF` isn't in scope, use `C`/`F_SANS`.)

- [ ] **Step 5: Type-check** — `cd frontend && npx tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/member/pages/HomePage.tsx
git commit -m "feat: emergency button with reason dropdown + free-text on member page"
```

---

## Task 9: Admin — emergency badge

**Files:** Modify the admin attendance view (identify exact file in Step 1)

- [ ] **Step 1: Locate the admin view** that renders today's attendance rows. Run: `grep -rln "emergency\|clock_out\|pendingApprovals\|late_status" frontend/components/admin | head`. The dashboard pulls `dashboard.members`/attendance; the most likely targets are `frontend/components/admin/pages/AttendancePage.tsx` and `frontend/components/admin/AdminDashboard.tsx`. Read whichever lists members/attendance for today and renders per-member rows.

- [ ] **Step 2: Surface `emergency` from the API.** Confirm the dashboard/attendance API returns the attendance `emergency`/`emergency_reason` fields. If `routes/dashboard.js` selects specific columns, add `emergency, emergency_reason` to its `attendance` select. (Read `routes/dashboard.js`; if it does `select('*')` no change is needed.)

- [ ] **Step 3: Render the badge.** In the member/attendance row markup, where status badges render, add:

```tsx
{row.emergency && (
  <span title={row.emergency_reason || 'Emergency'} style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 999, background: 'rgba(220,38,38,0.10)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.30)', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.06em' }}>
    🚨 EMERGENCY
  </span>
)}
```

(Match the row's loop variable; `row.emergency`/`row.emergency_reason` may be named per the API shape — adapt to the actual field names returned.)

- [ ] **Step 4: Type-check** — `cd frontend && npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: show emergency badge on admin attendance view"
```

---

## Task 10: Verify in the running app

**Files:** none (verification only).

- [ ] **Step 1: Backend** — `npx jest` → all suites pass.
- [ ] **Step 2: Frontend** — `cd frontend && npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Visual (playwright-cli is installed; use `--browser firefox`).** Build a harness page that renders `HomePage` with mock `memberData` representing a clocked-in member with `breakUsedSecs`, `onBreak: true`, `breakStart` a few minutes ago, and `lunchConsumed: false`. `playwright-cli open --browser firefox http://localhost:3001/<harness>`, then `screenshot --filename /tmp/member.png`; confirm the break button shows a counting timer and the Emergency button is present. Open the emergency modal (`playwright-cli click` the Emergency button), screenshot the reason dropdown. Delete the harness + `.next` after.
- [ ] **Step 4: No commit** (verification only).

---

## Self-Review Notes

- **Spec coverage:** break budget/multi-session/secs (Task 3) ✓; lunch single-use/secs (Task 4) ✓; soft overrun (computed client-side, red, Task 7) ✓; emergency clock-out+flag+reason+alert (Task 5) ✓; reason dropdown+Other (Task 8) ✓; member-data aggregation incl. `.maybeSingle()` fix (Task 6) ✓; timers accurate via server used-secs + open start (Task 7) ✓; admin emergency badge (Task 9) ✓; migrations (Task 1) ✓; tests + visual verify (all backend tasks + Task 10) ✓.
- **Placeholder scan:** backend steps have full code; frontend steps include complete snippets with read-first guidance because exact line anchors vary.
- **Type consistency:** `timeToSeconds` (Task 2) used in Tasks 3-4; member-data fields `breakBudgetSecs/breakUsedSecs/lunchBudgetSecs/lunchUsedSecs/lunchConsumed` (Task 6) match the `MemberData` type and state (Task 7); `emergency`/`emergency_reason` columns (Task 1) match the update (Task 5) and badge (Task 9); `action: 'emergency'` + `reason` payload (Task 8) matches the handler (Task 5).
- **Manual steps:** run migrations 020 + 021 in Supabase before testing live.
