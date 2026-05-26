# n8n to Node.js Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 5 n8n workflows with a local Express.js server using Supabase SDK, applying Attendance Policy v2.0 business rules.

**Architecture:** Express API-only server on port 3000; pure business logic extracted to `lib/rules.js` for TDD; routes are thin wrappers around Supabase queries; Discord notifications are non-blocking fire-and-forget via bot token.

**Tech Stack:** Node.js 18+, Express 4, @supabase/supabase-js v2, dotenv 16, cors 2, Jest 29

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Create | Dependencies + Jest config |
| `.env.example` | Create | Credential template |
| `.gitignore` | Create | Exclude `.env` + `node_modules/` |
| `lib/rules.js` | Create | Pure business logic (testable, no DB) |
| `tests/rules.test.js` | Create | Jest unit tests for rules.js |
| `lib/supabase.js` | Create | Supabase client singleton |
| `lib/discord.js` | Create | Discord REST helper + channel ID constants |
| `server.js` | Create | Express app, CORS, route registration |
| `routes/checkRole.js` | Create | `POST /webhook/check-role` |
| `routes/attendance.js` | Create | `POST /webhook/attendance` (8 actions) |
| `routes/memberData.js` | Create | `GET /webhook/member-data` |
| `routes/dashboard.js` | Create | `GET /webhook/dashboard` |
| `routes/approve.js` | Create | `GET /webhook/approve` |
| `index.html` | Modify | URL constant + error message |
| `member.html` | Modify | URL constants, error message, Family Care option |
| `dashboard.html` | Modify | URL constants |

---

## Task 1: Scaffold

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Verify Node.js ≥ 18 (required for built-in fetch)**

Run: `node --version`
Expected: `v18.x.x` or higher. If lower, install Node 18 LTS before continuing.

- [ ] **Step 2: Create directories**

```bash
mkdir -p routes lib tests
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "anosupo-attendance-server",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "@supabase/supabase-js": "^2.39.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 4: Create `.env.example`**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_GUILD_ID=1505900322273493042
PORT=3000
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, lock file written, no errors.

- [ ] **Step 7: Copy template and fill credentials**

```bash
cp .env.example .env
```
Open `.env` and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `DISCORD_BOT_TOKEN` with real values.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: scaffold Node.js attendance server"
```

---

## Task 2: Business logic tests

**Files:**
- Create: `tests/rules.test.js`

- [ ] **Step 1: Create `tests/rules.test.js`**

```js
const { classifyLateStatus, timeToMinutes, calcNetHours, calendarDayStatus } = require('../lib/rules');

describe('classifyLateStatus', () => {
  test('before 9:00 → ON TIME', () => expect(classifyLateStatus(8, 59)).toBe('ON TIME'));
  test('exactly 9:00 → ON TIME', () => expect(classifyLateStatus(9, 0)).toBe('ON TIME'));
  test('9:10 → ON TIME', () => expect(classifyLateStatus(9, 10)).toBe('ON TIME'));
  test('9:11 → MINOR TARDY', () => expect(classifyLateStatus(9, 11)).toBe('MINOR TARDY'));
  test('9:30 → MINOR TARDY', () => expect(classifyLateStatus(9, 30)).toBe('MINOR TARDY'));
  test('9:31 → MAJOR TARDY', () => expect(classifyLateStatus(9, 31)).toBe('MAJOR TARDY'));
  test('11:00 → MAJOR TARDY', () => expect(classifyLateStatus(11, 0)).toBe('MAJOR TARDY'));
  test('11:01 → AWOL HALF DAY', () => expect(classifyLateStatus(11, 1)).toBe('AWOL HALF DAY'));
  test('13:00 → AWOL HALF DAY', () => expect(classifyLateStatus(13, 0)).toBe('AWOL HALF DAY'));
});

describe('timeToMinutes', () => {
  test('09:00 → 540', () => expect(timeToMinutes('09:00')).toBe(540));
  test('18:30 → 1110', () => expect(timeToMinutes('18:30')).toBe(1110));
  test('00:00 → 0', () => expect(timeToMinutes('00:00')).toBe(0));
});

describe('calcNetHours', () => {
  test('09:00 to 18:00 → 8h (minus 1h unpaid lunch)', () => expect(calcNetHours('09:00', '18:00')).toBe(8));
  test('09:00 to 09:30 → 0 (never goes negative)', () => expect(calcNetHours('09:00', '09:30')).toBe(0));
  test('09:00 to 17:30 → 7.5h', () => expect(calcNetHours('09:00', '17:30')).toBe(7.5));
  test('09:15 to 18:15 → 8h', () => expect(calcNetHours('09:15', '18:15')).toBe(8));
  test('09:00 to 10:00 → 0 (exactly 1h work, minus 1h = 0)', () => expect(calcNetHours('09:00', '10:00')).toBe(0));
});

describe('calendarDayStatus', () => {
  test('weekend with no record → weekend', () =>
    expect(calendarDayStatus(null, true)).toBe('weekend'));
  test('weekend with a record → weekend (takes priority)', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '18:00', late_status: 'ON TIME' }, true)).toBe('weekend'));
  test('no record on weekday → absent', () =>
    expect(calendarDayStatus(null, false)).toBe('absent'));
  test('status=Pending → pending', () =>
    expect(calendarDayStatus({ status: 'Pending', clock_out: null, late_status: '' }, false)).toBe('pending'));
  test('has clock_out value → clocked-out', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '18:00', late_status: 'ON TIME' }, false)).toBe('clocked-out'));
  test('clock_out is empty string → not clocked-out', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'ON TIME' }, false)).toBe('present'));
  test('approved, no clock_out, ON TIME → present', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'ON TIME' }, false)).toBe('present'));
  test('approved, no clock_out, MINOR TARDY → late', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'MINOR TARDY' }, false)).toBe('late'));
  test('approved, no clock_out, MAJOR TARDY → late', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'MAJOR TARDY' }, false)).toBe('late'));
  test('approved, no clock_out, AWOL HALF DAY → late', () =>
    expect(calendarDayStatus({ status: 'Approved', clock_out: '', late_status: 'AWOL HALF DAY' }, false)).toBe('late'));
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

Run: `npm test`
Expected output contains: `Cannot find module '../lib/rules'`

---

## Task 3: Business logic implementation

**Files:**
- Create: `lib/rules.js`

- [ ] **Step 1: Create `lib/rules.js`**

```js
function classifyLateStatus(jstHour, jstMinute) {
  if (jstHour < 9 || (jstHour === 9 && jstMinute <= 10)) return 'ON TIME';
  if (jstHour === 9 && jstMinute <= 30) return 'MINOR TARDY';
  if (jstHour < 11 || (jstHour === 11 && jstMinute === 0)) return 'MAJOR TARDY';
  return 'AWOL HALF DAY';
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function calcNetHours(clockInStr, clockOutStr) {
  const diff = (timeToMinutes(clockOutStr) - timeToMinutes(clockInStr)) / 60 - 1;
  return Math.max(0, Math.round(diff * 100) / 100);
}

function calendarDayStatus(record, isWeekend) {
  if (isWeekend) return 'weekend';
  if (!record) return 'absent';
  if (record.status === 'Pending') return 'pending';
  if (record.clock_out) return 'clocked-out';
  if (record.late_status === 'ON TIME') return 'present';
  return 'late';
}

function todayJST() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo' });
}

module.exports = { classifyLateStatus, timeToMinutes, calcNetHours, calendarDayStatus, todayJST };
```

- [ ] **Step 2: Run tests — expect all PASS**

Run: `npm test`
Expected: `Tests: 21 passed, 21 total` (no failures)

- [ ] **Step 3: Commit**

```bash
git add lib/rules.js tests/rules.test.js
git commit -m "feat: add business logic with full test coverage (Policy v2.0)"
```

---

## Task 4: Supabase client and Discord helper

**Files:**
- Create: `lib/supabase.js`
- Create: `lib/discord.js`

- [ ] **Step 1: Create `lib/supabase.js`**

```js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

module.exports = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
```

- [ ] **Step 2: Create `lib/discord.js`**

```js
const CHANNELS = {
  clockLogs: '1505900376719884319',
  approvals:  '1505900412937699408'
};

async function sendMessage(channelId, content) {
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.error('Discord notification failed:', err.message);
  }
}

module.exports = { sendMessage, CHANNELS };
```

- [ ] **Step 3: Verify tests still pass after adding new files**

Run: `npm test`
Expected: all 21 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase.js lib/discord.js
git commit -m "feat: add Supabase client singleton and Discord message helper"
```

---

## Task 5: Express server entry point

**Files:**
- Create: `server.js`

- [ ] **Step 1: Create `server.js`**

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith('http://localhost') || origin === 'https://sparkies14.github.io') {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

app.use('/webhook/check-role',  require('./routes/checkRole'));
app.use('/webhook/attendance',  require('./routes/attendance'));
app.use('/webhook/member-data', require('./routes/memberData'));
app.use('/webhook/dashboard',   require('./routes/dashboard'));
app.use('/webhook/approve',     require('./routes/approve'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Attendance server running on http://localhost:${PORT}`));
```

- [ ] **Step 2: Verify server starts (will error on missing route files — that's expected)**

Run: `node server.js`

If you see `Error: Cannot find module './routes/checkRole'`, that's expected — routes aren't created yet. If you see a Supabase or dotenv error instead, fix `.env` first.

Press Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add Express server with CORS and route mounts"
```

---

## Task 6: check-role route

**Files:**
- Create: `routes/checkRole.js`

- [ ] **Step 1: Create `routes/checkRole.js`**

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');

router.post('/', async (req, res) => {
  const { email } = req.body;

  const { data: manager } = await supabase
    .from('managers').select('id').eq('email', email).maybeSingle();
  if (manager) return res.json({ role: 'goldlist' });

  const { data: member } = await supabase
    .from('members').select('id').eq('email', email).maybeSingle();
  if (member) return res.json({ role: 'whitelist' });

  res.json({ role: 'denied' });
});

module.exports = router;
```

- [ ] **Step 2: Start server and smoke test**

Terminal 1: `node server.js`

Terminal 2:
```bash
curl -s -X POST http://localhost:3000/webhook/check-role \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@test.com","name":"Test"}' | jq .
```
Expected: `{ "role": "denied" }`

- [ ] **Step 3: Commit**

```bash
git add routes/checkRole.js
git commit -m "feat: add check-role route"
```

---

## Task 7: attendance route

**Files:**
- Create: `routes/attendance.js`

- [ ] **Step 1: Create `routes/attendance.js`**

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { sendMessage, CHANNELS } = require('../lib/discord');
const { classifyLateStatus, timeToMinutes, calcNetHours } = require('../lib/rules');

router.post('/', async (req, res) => {
  const {
    email, action, entry_type, local_time, date,
    jst_hour, jst_minute, fingerprint, reason, leave_type
  } = req.body;

  // Verify member — use official name from DB, not browser input
  const { data: member } = await supabase
    .from('members').select('name, role').eq('email', email).maybeSingle();
  if (!member) {
    return res.status(400).json({ error: 'Your name is not registered. Please contact your manager.' });
  }
  const officialName = member.name;
  const role = member.role;

  // Late classification only applies to clock-in
  const late_status = action === 'clock-in'
    ? classifyLateStatus(Number(jst_hour), Number(jst_minute))
    : '';

  // Manual entry — any action except leave goes to pending approval
  if (entry_type === 'manual' && action !== 'leave') {
    const { error } = await supabase.from('attendance').insert({
      email, name: officialName, date,
      clock_in: local_time, clock_out: '', total_hours: 0,
      entry_type, status: 'Pending', late_status, reason, fingerprint, role
    });
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.approvals,
      `📋 **Manual Entry** — ${officialName}\nDate: ${date} | Time: ${local_time} | Reason: ${reason}`);
    return res.json({ success: true, message: 'Manual entry submitted! Waiting for manager approval.' });
  }

  // Auto entry — branch on action
  if (action === 'clock-in') {
    const { data: dup } = await supabase
      .from('attendance').select('id').eq('email', email).eq('date', date).maybeSingle();
    if (dup) return res.status(400).json({ error: 'You already clocked in today. Use Clock Out instead.' });

    const { error } = await supabase.from('attendance').insert({
      email, name: officialName, date,
      clock_in: local_time, clock_out: '', total_hours: 0,
      entry_type, status: 'Approved', late_status, reason: '', fingerprint, role
    });
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.clockLogs,
      `🟢 **Clock In** — ${officialName} | ${date} ${local_time} | ${late_status}`);
    return res.json({ success: true, message: 'Clock in recorded!' });
  }

  if (action === 'clock-out') {
    const { data: row } = await supabase
      .from('attendance').select('id, clock_in').eq('email', email).eq('date', date).maybeSingle();
    if (!row) return res.status(400).json({ error: 'No clock-in record found for today.' });

    // Policy §3: subtract 1h unpaid lunch from net hours; minimum 0
    const total_hours = calcNetHours(row.clock_in, local_time);
    const { error } = await supabase.from('attendance')
      .update({ clock_out: local_time, total_hours, status: 'Approved' })
      .eq('id', row.id);
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.clockLogs,
      `🔴 **Clock Out** — ${officialName} | ${date} ${local_time} | Net: ${total_hours}h`);
    return res.json({ success: true, message: 'Clock out recorded!' });
  }

  if (action === 'leave') {
    const { error } = await supabase.from('leave_log').insert({
      email, name: officialName, date, leave_type, reason, status: 'Pending'
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: '🏖️ Leave request submitted! Manager will review shortly.' });
  }

  if (action === 'lunch-out') {
    const { error } = await supabase.from('lunch_log').insert({
      name: officialName, date, lunch_out: local_time, lunch_in: '', duration_mins: 0
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Lunch out recorded!' });
  }

  if (action === 'lunch-in') {
    const { data: lunchRow } = await supabase
      .from('lunch_log').select('id, lunch_out').eq('name', officialName).eq('date', date).maybeSingle();
    if (!lunchRow) return res.status(400).json({ error: 'No lunch-out record found.' });
    const duration_mins = timeToMinutes(local_time) - timeToMinutes(lunchRow.lunch_out);
    const { error } = await supabase.from('lunch_log')
      .update({ lunch_in: local_time, duration_mins }).eq('id', lunchRow.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Lunch in recorded!' });
  }

  if (action === 'break-out') {
    const { error } = await supabase.from('break_log').insert({
      name: officialName, date, break_out: local_time, break_in: '', duration_mins: 0
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Break out recorded!' });
  }

  if (action === 'break-in') {
    const { data: breakRow } = await supabase
      .from('break_log').select('id, break_out').eq('name', officialName).eq('date', date).maybeSingle();
    if (!breakRow) return res.status(400).json({ error: 'No break-out record found.' });
    const duration_mins = timeToMinutes(local_time) - timeToMinutes(breakRow.break_out);
    const { error } = await supabase.from('break_log')
      .update({ break_in: local_time, duration_mins }).eq('id', breakRow.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Break in recorded!' });
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
});

module.exports = router;
```

- [ ] **Step 2: Smoke test — unregistered member**

```bash
curl -s -X POST http://localhost:3000/webhook/attendance \
  -H 'Content-Type: application/json' \
  -d '{"email":"ghost@test.com","action":"clock-in","entry_type":"auto","local_time":"09:00","date":"5/26/2026","jst_hour":9,"jst_minute":0}' | jq .
```
Expected: `{ "error": "Your name is not registered. Please contact your manager." }`

- [ ] **Step 3: Commit**

```bash
git add routes/attendance.js
git commit -m "feat: add attendance route with all 8 actions and Policy v2.0 rules"
```

---

## Task 8: member-data route

**Files:**
- Create: `routes/memberData.js`

- [ ] **Step 1: Create `routes/memberData.js`**

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { calendarDayStatus, todayJST } = require('../lib/rules');

router.get('/', async (req, res) => {
  const { email, month, year } = req.query;
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);
  const today = todayJST();

  const { data: member } = await supabase
    .from('members').select('name').eq('email', email).maybeSingle();
  if (!member) return res.status(400).json({ error: 'Member not found.' });
  const officialName = member.name;

  // Fetch all data in parallel
  const [
    { data: allAttendance },
    { data: allLeave },
    { data: lunchToday },
    { data: breakToday }
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('email', email),
    supabase.from('leave_log').select('*').eq('email', email),
    supabase.from('lunch_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
    supabase.from('break_log').select('*').eq('name', officialName).eq('date', today).maybeSingle()
  ]);

  // Filter attendance to requested month/year
  const monthAtt = (allAttendance || []).filter(a => {
    const d = new Date(a.date);
    return d.getMonth() + 1 === monthNum && d.getFullYear() === yearNum;
  });

  // Build calendar array for every day in the month
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const calendar = [];
  const summary = { present: 0, late: 0, absent: 0, pending: 0 };

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(yearNum, monthNum - 1, day);
    const dateStr = d.toLocaleDateString('en-US');
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    // Normalize stored date strings for comparison (handles locale format differences)
    const record = monthAtt.find(
      a => new Date(a.date).toLocaleDateString('en-US') === dateStr
    ) || null;

    const status = calendarDayStatus(record, isWeekend);

    if (!isWeekend) {
      if (status === 'present') summary.present++;
      else if (status === 'late') summary.late++;
      else if (status === 'absent') summary.absent++;
      else if (status === 'pending') summary.pending++;
    }

    calendar.push({
      day,
      date: dateStr,
      status,
      clockIn: record?.clock_in || '-',
      clockOut: record?.clock_out || '-',
      // Only show totalHours once clocked out; show '-' if still clocked in
      totalHours: record?.clock_out ? record.total_hours : '-',
      isWeekend
    });
  }

  const leaveHistory = (allLeave || []).map(l => ({
    date: l.date,
    leaveType: l.leave_type,
    reason: l.reason,
    status: l.status
  }));

  res.json({
    month: monthNum,
    year: yearNum,
    email,
    calendar,
    summary,
    // onLunch: lunch-out recorded AND lunch-in not yet recorded
    onLunch: !!(lunchToday && !lunchToday.lunch_in),
    // onBreak: break-out recorded AND break-in not yet recorded
    onBreak: !!(breakToday && !breakToday.break_in),
    leaveHistory
  });
});

module.exports = router;
```

- [ ] **Step 2: Smoke test — unknown member**

```bash
curl -s "http://localhost:3000/webhook/member-data?email=nobody@test.com&month=5&year=2026" | jq .
```
Expected: `{ "error": "Member not found." }`

- [ ] **Step 3: Commit**

```bash
git add routes/memberData.js
git commit -m "feat: add member-data route with onLunch/onBreak state fix"
```

---

## Task 9: dashboard route

**Files:**
- Create: `routes/dashboard.js`

- [ ] **Step 1: Create `routes/dashboard.js`**

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { todayJST } = require('../lib/rules');

router.get('/', async (req, res) => {
  const today = todayJST();

  // Fetch today's attendance only — fixes n8n bug that fetched all rows
  const [
    { data: todayAtt },
    { data: allMembers },
    { data: pendingAtt },
    { data: pendingLeave }
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('date', today),
    supabase.from('members').select('*').eq('status', 'Active'),
    supabase.from('attendance').select('*').eq('status', 'Pending'),
    supabase.from('leave_log').select('*').eq('status', 'Pending')
  ]);

  const att = todayAtt || [];
  const members = allMembers || [];

  const membersWithStatus = members.map(m => {
    const rec = att.find(a => a.email === m.email);
    let status;
    if (!rec)                                              status = 'NOT CLOCKED IN';
    else if (rec.status === 'Pending')                     status = 'PENDING APPROVAL';
    else if (rec.clock_out)                                status = 'CLOCKED OUT';
    else if (rec.late_status && rec.late_status !== 'ON TIME') status = 'CLOCKED IN (LATE)';
    else                                                   status = 'CLOCKED IN';

    return {
      name: m.name,
      email: m.email,
      role: m.role,
      status,
      clockIn: rec?.clock_in || '-',
      clockOut: rec?.clock_out || '-',
      totalHours: rec?.total_hours ?? '-',
      lateStatus: rec?.late_status || ''
    };
  });

  const summary = {
    clockedIn: membersWithStatus.filter(m => m.status === 'CLOCKED IN' || m.status === 'CLOCKED IN (LATE)').length,
    clockedOut: membersWithStatus.filter(m => m.status === 'CLOCKED OUT').length,
    notIn: membersWithStatus.filter(m => m.status === 'NOT CLOCKED IN').length,
    pending: membersWithStatus.filter(m => m.status === 'PENDING APPROVAL').length,
    total: members.length
  };

  res.json({
    date: today,
    summary,
    members: membersWithStatus,
    pendingApprovals: pendingAtt || [],
    pendingLeave: pendingLeave || []
  });
});

module.exports = router;
```

- [ ] **Step 2: Smoke test**

```bash
curl -s http://localhost:3000/webhook/dashboard | jq '{date:.date, summary:.summary}'
```
Expected: today's JST date (e.g. `"5/26/2026"`) and a `summary` object with numeric counts.

- [ ] **Step 3: Commit**

```bash
git add routes/dashboard.js
git commit -m "feat: add dashboard route filtered to today (JST) only"
```

---

## Task 10: approve route

**Files:**
- Create: `routes/approve.js`

- [ ] **Step 1: Create `routes/approve.js`**

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { sendMessage, CHANNELS } = require('../lib/discord');

router.get('/', async (req, res) => {
  const { action, row, type } = req.query;
  const id = parseInt(row);

  if (!id || id <= 0) return res.status(400).json({ error: 'Invalid row id.' });
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject".' });
  }

  const new_status = action === 'approve' ? 'Approved' : 'Rejected';
  const table = type === 'leave' ? 'leave_log' : 'attendance';

  const { error } = await supabase.from(table).update({ status: new_status }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  await sendMessage(CHANNELS.approvals,
    `${action === 'approve' ? '✅' : '❌'} Entry #${id} (${type}) has been **${new_status}**.`);
  res.json({ success: true, message: 'Status updated successfully!' });
});

module.exports = router;
```

- [ ] **Step 2: Smoke test — invalid id**

```bash
curl -s "http://localhost:3000/webhook/approve?action=approve&row=0&type=manual" | jq .
```
Expected: `{ "error": "Invalid row id." }`

- [ ] **Step 3: Commit**

```bash
git add routes/approve.js
git commit -m "feat: add approve route for attendance and leave entries"
```

---

## Task 11: HTML updates

**Files:**
- Modify: `index.html`
- Modify: `member.html`
- Modify: `dashboard.html`

### index.html

- [ ] **Step 1: Update CHECK_ROLE URL**

Find this line (search for `5678/webhook/check-role`):
```js
const CHECK_ROLE = 'http://localhost:5678/webhook/check-role';
```
Change to:
```js
const CHECK_ROLE = 'http://localhost:3000/webhook/check-role';
```

- [ ] **Step 2: Update error message**

Find (search for `Check n8n is running`):
```js
showStatus('error', 'Connection failed. Check n8n is running.');
```
Change to:
```js
showStatus('error', 'Connection failed. Check the server is running.');
```

### member.html

- [ ] **Step 3: Update all URL constants**

Search for every occurrence of `localhost:5678` in `member.html` and replace each with `localhost:3000`. There are 3 occurrences in the URL constant declarations near the top of the `<script>` section.

- [ ] **Step 4: Update error message**

Find (search for `n8n workflow is active` or similar n8n mention in member.html):
Replace the n8n mention with: `Check the server is running`

- [ ] **Step 5: Add Family Care leave option**

Find the leave-type `<select>` element in member.html (search for `leave-type` or `Sick Leave`). The existing options are Sick Leave, Personal, Emergency, Vacation. Add after the last `<option>`:
```html
<option value="Family Care">Family Care</option>
```

### dashboard.html

- [ ] **Step 6: Update URL constants**

Find `DASHBOARD_URL` and `APPROVE_URL` constants in `dashboard.html` (search for `localhost:5678`). Change `5678` to `3000` in both lines.

- [ ] **Step 7: Commit all HTML changes**

```bash
git add index.html member.html dashboard.html
git commit -m "feat: update HTML files to use Node.js server and add Family Care leave type"
```

---

## Task 12: Full smoke test

- [ ] **Step 1: Run unit tests one last time**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 2: Start server**

```bash
node server.js
```
Expected: `Attendance server running on http://localhost:3000`

- [ ] **Step 3: Verify all 5 routes respond correctly**

In a second terminal, run each curl command and check the expected output:

```bash
# 1. check-role — unknown user
curl -s -X POST http://localhost:3000/webhook/check-role \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@test.com","name":"Test"}' | jq .
# Expected: {"role":"denied"}

# 2. attendance — unregistered member
curl -s -X POST http://localhost:3000/webhook/attendance \
  -H 'Content-Type: application/json' \
  -d '{"email":"ghost@test.com","action":"clock-in","entry_type":"auto","local_time":"09:00","date":"5/26/2026","jst_hour":9,"jst_minute":0}' | jq .
# Expected: {"error":"Your name is not registered. Please contact your manager."}

# 3. dashboard — shows today's date and active members
curl -s http://localhost:3000/webhook/dashboard | jq '{date:.date,total:.summary.total}'
# Expected: {"date":"5/26/2026","total":<number of active members>}

# 4. member-data — unknown member
curl -s "http://localhost:3000/webhook/member-data?email=nobody@test.com&month=5&year=2026" | jq .
# Expected: {"error":"Member not found."}

# 5. approve — invalid id
curl -s "http://localhost:3000/webhook/approve?action=approve&row=0&type=manual" | jq .
# Expected: {"error":"Invalid row id."}
```

- [ ] **Step 4: Open index.html and verify login flow**

Open `index.html` via VS Code Live Server (right-click → Open with Live Server) or at `http://127.0.0.1:5500/index.html`.

- Log in with a **manager email** → should see "Redirecting..." and land on `dashboard.html`
- Log out / clear session storage, log in with a **member email** → should land on `member.html`
- Log in with an **unknown email** → should see "Access denied"

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete n8n to Node.js migration with Attendance Policy v2.0"
```
