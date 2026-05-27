# Phase 4 — Leave Balance & Accrual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track each employee's leave balance using live computation (no stored balance) with admin adjustment capability, displayed as a balance card on member.html and a full management table on admin.html.

**Architecture:** A pure `computeBalance()` function in `lib/leaveBalance.js` derives the balance from hire year, approved leave count, and adjustment sums — no stored balance, nothing to go out of sync. Four API routes in `routes/leaveBalance.js` serve reads and admin writes. `admin.html` gains a new "Leave Balances" tab; `member.html` gains a balance card above the leave history.

**Tech Stack:** Node.js/Express 4, Supabase JS v2, Jest + supertest for tests, vanilla JS in HTML files. JWT stored as `sessionStorage.getItem('anosupo_jwt')`. `API_BASE = 'http://localhost:3000'` and `apiFetch(url, opts)` helper already exist in `admin.html`.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `migrations/010_create_leave_adjustments.sql` | Create | New `leave_adjustments` table |
| `lib/leaveBalance.js` | Create | Pure `computeBalance()` function |
| `tests/leaveBalance.lib.test.js` | Create | Unit tests for `computeBalance()` |
| `routes/leaveBalance.js` | Create | 4 API routes |
| `tests/leaveBalance.test.js` | Create | Integration tests for routes |
| `server.js` | Modify | Mount `/leave-balance` router (line 27 area) |
| `member.html` | Modify | Balance card above leave history + form warning |
| `admin.html` | Modify | New "Leave Balances" tab + adjust modal |

---

### Task 1: Migration — leave_adjustments table

**Files:**
- Create: `migrations/010_create_leave_adjustments.sql`

- [ ] **Step 1: Create the migration file**

```sql
create table leave_adjustments (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  amount      integer not null,
  note        text not null,
  created_by  text not null,
  created_at  timestamptz not null default now()
);
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Copy the SQL above, paste into Supabase → SQL Editor, click Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Commit**

```bash
git add migrations/010_create_leave_adjustments.sql
git commit -m "feat: add leave_adjustments migration"
```

---

### Task 2: Balance computation lib

**Files:**
- Create: `lib/leaveBalance.js`
- Create: `tests/leaveBalance.lib.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/leaveBalance.lib.test.js`:

```js
const { computeBalance } = require('../lib/leaveBalance');

const YEAR = new Date().getFullYear();

test('single year — no use, no adjustments', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 0, adjustments: 0 }))
    .toEqual({ grantsEarned: 10, used: 0, adjustments: 0, balance: 10 });
});

test('multi-year carry-over accumulates', () => {
  expect(computeBalance({ hireYear: YEAR - 2, currentYear: YEAR, used: 0, adjustments: 0 }))
    .toEqual({ grantsEarned: 30, used: 0, adjustments: 0, balance: 30 });
});

test('used days reduce balance', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 4, adjustments: 0 }))
    .toEqual({ grantsEarned: 10, used: 4, adjustments: 0, balance: 6 });
});

test('positive adjustment adds days', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 0, adjustments: 3 }))
    .toEqual({ grantsEarned: 10, used: 0, adjustments: 3, balance: 13 });
});

test('negative adjustment deducts days', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 0, adjustments: -5 }))
    .toEqual({ grantsEarned: 10, used: 0, adjustments: -5, balance: 5 });
});

test('balance can go negative when overused', () => {
  expect(computeBalance({ hireYear: YEAR, currentYear: YEAR, used: 12, adjustments: 0 }))
    .toEqual({ grantsEarned: 10, used: 12, adjustments: 0, balance: -2 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/leaveBalance.lib.test.js --no-coverage
```

Expected: FAIL — "Cannot find module '../lib/leaveBalance'"

- [ ] **Step 3: Write the implementation**

Create `lib/leaveBalance.js`:

```js
function computeBalance({ hireYear, currentYear, used, adjustments }) {
  const grantsEarned = (currentYear - hireYear + 1) * 10;
  return { grantsEarned, used, adjustments, balance: grantsEarned - used + adjustments };
}

module.exports = { computeBalance };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/leaveBalance.lib.test.js --no-coverage
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/leaveBalance.js tests/leaveBalance.lib.test.js
git commit -m "feat: add computeBalance lib and unit tests"
```

---

### Task 3: API routes

**Files:**
- Create: `routes/leaveBalance.js`
- Create: `tests/leaveBalance.test.js`

Routes to implement:
- `GET /leave-balance` — member's own or any (admin) by `?email=`
- `GET /leave-balance/all` — admin/owner only, all active members
- `GET /leave-balance/adjustments` — adjustment history by `?email=`
- `POST /leave-balance/adjust` — admin/owner only, create adjustment

- [ ] **Step 1: Write the failing tests**

Create `tests/leaveBalance.test.js`:

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
const router   = require('../routes/leaveBalance');

function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:        (resolve) => resolve(result),
    catch:       () => Promise.resolve(result),
    select:      jest.fn(() => ch),
    eq:          jest.fn(() => ch),
    neq:         jest.fn(() => ch),
    order:       jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single:      jest.fn(() => Promise.resolve(result)),
    insert:      jest.fn(() => ch),
  };
  return ch;
}

function makeApp(role, email) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email, role }; next(); });
  app.use('/balance', router);
  return app;
}

const YEAR      = new Date().getFullYear();
const HIRE_DATE = `${YEAR}-01-01T00:00:00Z`;
const USER      = { id: 'user-1', name: 'Ana', created_at: HIRE_DATE };
const USER_ID   = { id: 'user-1' };

beforeEach(() => jest.clearAllMocks());

/* ─── GET /balance ─── */
describe('GET /balance', () => {
  test('400 when email missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/balance');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('403 when member accesses another member', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/balance?email=other@test.com');
    expect(res.status).toBe(403);
  });

  test('404 when user not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/balance?email=ana@test.com');
    expect(res.status).toBe(404);
  });

  test('returns computed balance for own email', async () => {
    supabase.from.mockReturnValueOnce(c(USER));        // users
    supabase.from.mockReturnValueOnce(c([{}, {}]));    // leave_log — 2 approved
    supabase.from.mockReturnValueOnce(c([]));          // leave_adjustments
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/balance?email=ana@test.com');
    expect(res.status).toBe(200);
    expect(res.body.used).toBe(2);
    expect(res.body.grantsEarned).toBe(10); // hired this year → 1 × 10
    expect(res.body.balance).toBe(8);
  });

  test('admin can access any member balance', async () => {
    supabase.from.mockReturnValueOnce(c(USER));
    supabase.from.mockReturnValueOnce(c([]));              // 0 approved leaves
    supabase.from.mockReturnValueOnce(c([{ amount: 3 }])); // +3 adjustment
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/balance?email=ana@test.com');
    expect(res.status).toBe(200);
    expect(res.body.adjustments).toBe(3);
    expect(res.body.balance).toBe(13);
  });
});

/* ─── GET /balance/all ─── */
describe('GET /balance/all', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/balance/all');
    expect(res.status).toBe(403);
  });

  test('returns all active member balances sorted by name', async () => {
    supabase.from.mockReturnValueOnce(c([
      { id: 'user-1', email: 'ana@test.com', name: 'Ana', created_at: HIRE_DATE },
    ])); // users
    supabase.from.mockReturnValueOnce(c([
      { email: 'ana@test.com' }, { email: 'ana@test.com' },
    ])); // leave_log — 2 approved for Ana
    supabase.from.mockReturnValueOnce(c([])); // leave_adjustments
    const res = await request(makeApp('admin', 'admin@test.com')).get('/balance/all');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].used).toBe(2);
    expect(res.body.members[0].balance).toBe(8);
  });
});

/* ─── POST /balance/adjust ─── */
describe('POST /balance/adjust', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/balance/adjust').send({ email: 'ana@test.com', amount: 2, note: 'test' });
    expect(res.status).toBe(403);
  });

  test('400 when email missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/balance/adjust').send({ amount: 2, note: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('400 when amount is zero', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/balance/adjust').send({ email: 'ana@test.com', amount: 0, note: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-zero/i);
  });

  test('400 when note is empty', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/balance/adjust').send({ email: 'ana@test.com', amount: 3, note: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/note/i);
  });

  test('404 when member not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/balance/adjust').send({ email: 'ghost@test.com', amount: 3, note: 'test' });
    expect(res.status).toBe(404);
  });

  test('creates adjustment and returns 201', async () => {
    const INSERTED = {
      id: 1, user_id: 'user-1', amount: -2, note: 'fix',
      created_by: 'admin@test.com', created_at: '2026-05-27T00:00:00Z',
    };
    supabase.from.mockReturnValueOnce(c(USER_ID));  // users lookup
    supabase.from.mockReturnValueOnce(c(INSERTED)); // insert
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/balance/adjust').send({ email: 'ana@test.com', amount: -2, note: 'fix' });
    expect(res.status).toBe(201);
    expect(res.body.adjustment.amount).toBe(-2);
  });
});

/* ─── GET /balance/adjustments ─── */
describe('GET /balance/adjustments', () => {
  test('400 when email missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/balance/adjustments');
    expect(res.status).toBe(400);
  });

  test('403 when member accesses another member', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/balance/adjustments?email=other@test.com');
    expect(res.status).toBe(403);
  });

  test('returns adjustment list for own email', async () => {
    const ADJ = [{ id: 1, amount: 3, note: 'bonus', created_by: 'admin@test.com', created_at: '2026-05-27T00:00:00Z' }];
    supabase.from.mockReturnValueOnce(c(USER_ID));
    supabase.from.mockReturnValueOnce(c(ADJ));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/balance/adjustments?email=ana@test.com');
    expect(res.status).toBe(200);
    expect(res.body.adjustments).toHaveLength(1);
    expect(res.body.adjustments[0].amount).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/leaveBalance.test.js --no-coverage
```

Expected: FAIL — "Cannot find module '../routes/leaveBalance'"

- [ ] **Step 3: Write the route implementation**

Create `routes/leaveBalance.js`:

```js
const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { computeBalance } = require('../lib/leaveBalance');

router.use(requireAuth);

const currentYear = () => new Date().getFullYear();

router.get('/all', requireRole('owner', 'admin'), async (req, res) => {
  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, email, name, created_at')
    .eq('status', 'Active')
    .neq('role', 'owner');
  if (membersErr) return res.status(500).json({ error: membersErr.message });

  const { data: allLeaves, error: leavesErr } = await supabase
    .from('leave_log')
    .select('email')
    .eq('status', 'Approved');
  if (leavesErr) return res.status(500).json({ error: leavesErr.message });

  const { data: allAdj, error: adjErr } = await supabase
    .from('leave_adjustments')
    .select('user_id, amount');
  if (adjErr) return res.status(500).json({ error: adjErr.message });

  const year = currentYear();
  const result = (members || []).map(m => {
    const hireYear = new Date(m.created_at).getFullYear();
    const used = (allLeaves || []).filter(l => l.email === m.email).length;
    const adjustments = (allAdj || [])
      .filter(a => a.user_id === m.id)
      .reduce((s, a) => s + a.amount, 0);
    return {
      email: m.email,
      name: m.name,
      hire_year: hireYear,
      ...computeBalance({ hireYear, currentYear: year, used, adjustments }),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return res.json({ members: result });
});

router.get('/adjustments', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param required.' });
  const elevated = ['owner', 'admin'].includes(req.user.role);
  if (!elevated && req.user.email !== email) return res.status(403).json({ error: 'Forbidden.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id').eq('email', email).maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Member not found.' });

  const { data, error } = await supabase
    .from('leave_adjustments')
    .select('id, amount, note, created_by, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ adjustments: data || [] });
});

router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param required.' });
  const elevated = ['owner', 'admin'].includes(req.user.role);
  if (!elevated && req.user.email !== email) return res.status(403).json({ error: 'Forbidden.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id, name, created_at').eq('email', email).maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Member not found.' });

  const [{ data: leaves, error: leavesErr }, { data: adjs, error: adjErr }] = await Promise.all([
    supabase.from('leave_log').select('id').eq('email', email).eq('status', 'Approved'),
    supabase.from('leave_adjustments').select('amount').eq('user_id', user.id),
  ]);
  if (leavesErr) return res.status(500).json({ error: leavesErr.message });
  if (adjErr) return res.status(500).json({ error: adjErr.message });

  const hireYear = new Date(user.created_at).getFullYear();
  const year = currentYear();
  const used = (leaves || []).length;
  const adjustments = (adjs || []).reduce((s, a) => s + a.amount, 0);

  return res.json({
    email,
    name: user.name,
    hire_year: hireYear,
    ...computeBalance({ hireYear, currentYear: year, used, adjustments }),
  });
});

router.post('/adjust', requireRole('owner', 'admin'), async (req, res) => {
  const { email, amount, note } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required.' });
  const amt = parseInt(amount, 10);
  if (!Number.isInteger(amt) || amt === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero integer.' });
  }
  if (!note || !note.trim()) return res.status(400).json({ error: 'note is required.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id').eq('email', email).eq('status', 'Active').maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Active member not found.' });

  const { data, error } = await supabase
    .from('leave_adjustments')
    .insert({ user_id: user.id, amount: amt, note: note.trim(), created_by: req.user.email })
    .select('id, user_id, amount, note, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ adjustment: data });
});

module.exports = router;
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
npx jest tests/leaveBalance.test.js tests/leaveBalance.lib.test.js --no-coverage
```

Expected: PASS — all tests passing.

- [ ] **Step 5: Commit**

```bash
git add routes/leaveBalance.js tests/leaveBalance.test.js
git commit -m "feat: add leave balance routes and integration tests"
```

---

### Task 4: Mount router in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the router mount**

Open `server.js`. After the line `app.use('/leave', require('./routes/leaveEvidence'));` (currently line 27), add:

```js
app.use('/leave-balance', require('./routes/leaveBalance'));
```

- [ ] **Step 2: Verify the server starts**

```bash
node server.js
```

Expected: server starts with "Attendance server running on http://localhost:3000". Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: mount leave-balance router"
```

---

### Task 5: member.html — balance card and form warning

**Files:**
- Modify: `member.html`

Context: `member.html` has a `loadMemberData()` function (around line 1313) that fetches member data and calls `renderMemberData()`. The leave history container is `<div id="leave-history-container">` (around line 796). The leave submission path starts at `if (action === 'leave')` (around line 1228).

- [ ] **Step 1: Add the balance card HTML**

Find `<div id="leave-history-container">` in member.html. Insert this HTML immediately before it:

```html
<div class="balance-card" id="leave-balance-card" style="display:none">
  <div class="balance-label">Leave Balance</div>
  <div class="balance-days" id="leave-balance-days">—</div>
  <div class="balance-sub" id="leave-balance-sub"></div>
</div>
```

- [ ] **Step 2: Add balance card CSS**

Find the `<style>` block in member.html. Add these rules:

```css
.balance-card {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 16px;
}
.balance-label { font-size: 12px; color: #16a34a; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.balance-days  { font-size: 28px; font-weight: 700; color: #15803d; margin: 4px 0 2px; }
.balance-sub   { font-size: 12px; color: #6b7280; }
.balance-card.warn { background: #fff7ed; border-color: #fed7aa; }
.balance-card.warn .balance-label { color: #ea580c; }
.balance-card.warn .balance-days  { color: #c2410c; }
```

- [ ] **Step 3: Add the fetchLeaveBalance function**

Find the `<script>` block. Add this function near the other data-fetching functions (e.g. near `loadMemberData`):

```js
async function fetchLeaveBalance(email) {
  try {
    const jwt = sessionStorage.getItem('anosupo_jwt');
    const res = await fetch(
      `${API_BASE}/leave-balance?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    if (!res.ok) return;
    const { grantsEarned, used, adjustments, balance } = await res.json();
    const card = document.getElementById('leave-balance-card');
    document.getElementById('leave-balance-days').textContent =
      `${balance} day${balance === 1 ? '' : 's'} remaining`;
    document.getElementById('leave-balance-sub').textContent =
      `${used} used · ${grantsEarned + adjustments} earned`;
    card.className = 'balance-card' + (balance <= 0 ? ' warn' : '');
    card.style.display = '';
    card.dataset.balance = balance;
  } catch (_) {}
}
```

Note: `API_BASE` is already defined in member.html as `'http://localhost:3000'` — confirm the variable name by searching for it; if it differs, use the correct one or inline the URL directly.

- [ ] **Step 4: Call fetchLeaveBalance from loadMemberData**

Find `loadMemberData()` (around line 1313). After the line `memberData = data;`, add:

```js
fetchLeaveBalance(currentUser.email);
```

The function now looks like:
```js
async function loadMemberData() {
  if (!currentUser) return;
  try {
    const res  = await apiFetch(`${MEMBER_DATA}?email=...`)
    const data = await res.json();
    memberData = data;
    fetchLeaveBalance(currentUser.email);  // ← add this line
    renderMemberData();
    updateTodaySummary();
    renderPayroll();
    resetRefreshPulse();
  } catch(e) {
    console.error('Failed to load member data:', e);
  }
}
```

- [ ] **Step 5: Add zero-balance warning on leave submission**

Find `if (action === 'leave') {` (around line 1228). Add these lines at the very start of that block, before the existing validations:

```js
if (action === 'leave') {
  const card = document.getElementById('leave-balance-card');
  const bal  = card ? parseInt(card.dataset.balance || '1', 10) : 1;
  if (bal <= 0) {
    const go = confirm('You have no remaining leave days. Your request will still be sent for approval. Continue?');
    if (!go) return;
  }
  // existing validations below...
  const leaveType = document.getElementById('leave-type').value;
```

- [ ] **Step 6: Commit**

```bash
git add member.html
git commit -m "feat: add leave balance card to member.html"
```

---

### Task 6: admin.html — Leave Balances tab

**Files:**
- Modify: `admin.html`

Context: `admin.html` has a tab system driven by `switchPage(name)` (around line 473). The `pages` array is `['users', 'audit', 'tardy', 'holidays', 'policy']`. Each page has a `<div id="page-<name>">` and a tab `<button id="tab-<name>">`. `apiFetch`, `escapeHtml`, and `API_BASE` are all already available.

- [ ] **Step 1: Add the tab button**

Find the tab bar (around line 65–70). After the Policy Config tab button, add:

```html
<button type="button" id="tab-leave-balance" onclick="switchPage('leave-balance')" style="padding:8px 16px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);">Leave Balances</button>
```

- [ ] **Step 2: Add the page div**

Find `</div>` that closes the last page div (after `page-policy`, around line 260). After it, add:

```html
<div id="page-leave-balance" class="page" style="display:none">
  <h2>Leave Balances</h2>
  <div style="margin-bottom:1rem;">
    <button onclick="loadLeaveBalances()">Refresh</button>
  </div>
  <div id="leave-balances-body">
    <p style="color:#888;">Loading...</p>
  </div>
</div>

<!-- Adjust Leave Balance Modal -->
<div id="modal-adjust-leave" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:none;align-items:center;justify-content:center;">
  <div style="background:#fff;padding:2rem;border-radius:8px;min-width:320px;max-width:420px;">
    <h3 style="margin-top:0;">Adjust Leave Balance</h3>
    <p id="adjust-leave-name" style="margin:0 0 1rem;font-weight:600;"></p>
    <div style="margin-bottom:1rem;">
      <label style="display:block;margin-bottom:4px;">Days to add (use negative to deduct)</label>
      <input type="number" id="adjust-leave-amount" style="width:100%;padding:6px 8px;box-sizing:border-box;" placeholder="e.g. 2 or -3">
    </div>
    <div style="margin-bottom:1rem;">
      <label style="display:block;margin-bottom:4px;">Reason (required)</label>
      <input type="text" id="adjust-leave-note" style="width:100%;padding:6px 8px;box-sizing:border-box;" placeholder="e.g. Correcting hire year">
    </div>
    <div id="adjust-leave-error" style="color:#ef4444;font-size:13px;min-height:18px;margin-bottom:10px;"></div>
    <div style="display:flex;gap:10px;">
      <button onclick="submitLeaveAdjustment()">Save</button>
      <button onclick="closeAdjustLeaveModal()">Cancel</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Register the new page in switchPage**

Find `switchPage` (around line 473). Update the `pages` array and `titles` object:

```js
const pages = ['users', 'audit', 'tardy', 'holidays', 'policy', 'leave-balance'];
const titles = {
  users:          'User Management',
  audit:          'Audit Log',
  tardy:          'Tardy Report',
  holidays:       'Holidays',
  policy:         'Policy Config',
  'leave-balance': 'Leave Balances',
};
```

Then add the side effect at the end of `switchPage` (after the existing `if (name === 'policy')` line):

```js
if (name === 'leave-balance') loadLeaveBalances();
```

- [ ] **Step 4: Add the Leave Balances JS functions**

Find the `<script>` block. Add these functions:

```js
let _adjustLeaveEmail = '';

async function loadLeaveBalances() {
  const body = document.getElementById('leave-balances-body');
  body.innerHTML = '<p style="color:#888;">Loading...</p>';
  try {
    const res     = await apiFetch(`${API_BASE}/leave-balance/all`);
    const { members } = await res.json();
    if (!members || members.length === 0) {
      body.innerHTML = '<p style="color:#888;">No members found.</p>';
      return;
    }
    body.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Name</th>
            <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Balance</th>
            <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Used</th>
            <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Earned</th>
            <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Adjusted</th>
            <th style="padding:8px;border-bottom:2px solid #ddd;"></th>
          </tr>
        </thead>
        <tbody>
          ${members.map(m => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(m.name)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${m.balance}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${m.used}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${m.grantsEarned}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${m.adjustments >= 0 ? '+' : ''}${m.adjustments}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">
                <button onclick="openAdjustLeaveModal(${JSON.stringify(m.email)}, ${JSON.stringify(m.name)})">Adjust</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    body.innerHTML = `<p style="color:red;">${escapeHtml(e.message)}</p>`;
  }
}

function openAdjustLeaveModal(email, name) {
  _adjustLeaveEmail = email;
  document.getElementById('adjust-leave-name').textContent = name;
  document.getElementById('adjust-leave-amount').value = '';
  document.getElementById('adjust-leave-note').value   = '';
  document.getElementById('adjust-leave-error').textContent = '';
  const modal = document.getElementById('modal-adjust-leave');
  modal.style.display = 'flex';
}

function closeAdjustLeaveModal() {
  document.getElementById('modal-adjust-leave').style.display = 'none';
}

async function submitLeaveAdjustment() {
  const amount = parseInt(document.getElementById('adjust-leave-amount').value, 10);
  const note   = document.getElementById('adjust-leave-note').value.trim();
  const errEl  = document.getElementById('adjust-leave-error');
  errEl.textContent = '';

  if (!amount || amount === 0) { errEl.textContent = 'Amount must be a non-zero integer.'; return; }
  if (!note)                   { errEl.textContent = 'Reason is required.'; return; }

  try {
    const res = await apiFetch(`${API_BASE}/leave-balance/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: _adjustLeaveEmail, amount, note }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      errEl.textContent = error || 'Error saving adjustment.';
      return;
    }
    closeAdjustLeaveModal();
    loadLeaveBalances();
  } catch (e) {
    errEl.textContent = e.message;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat: add leave balances tab and adjust modal to admin.html"
```

---

## Self-Review

**Spec coverage:**
- [x] `leave_adjustments` table → Task 1
- [x] `computeBalance()` formula (hire_year, grants_earned, used, adjustments, balance) → Task 2
- [x] `GET /leave-balance?email=` (self or admin) → Task 3
- [x] `GET /leave-balance/all` (admin/owner only) → Task 3
- [x] `POST /leave-balance/adjust` (admin/owner only, non-zero amount, required note) → Task 3
- [x] `GET /leave-balance/adjustments?email=` (self or admin) → Task 3
- [x] Mount in server.js → Task 4
- [x] member.html balance card (days remaining, used, earned) → Task 5
- [x] member.html zero-balance confirmation warning → Task 5
- [x] admin.html Leave Balances table (name, balance, used, earned, adjusted, adjust button) → Task 6
- [x] admin.html Adjust modal (amount, note, validation, close on success) → Task 6

**Placeholder scan:** No TBDs, no vague steps. All code is complete. ✅

**Type consistency:**
- `computeBalance({ hireYear, currentYear, used, adjustments })` — same signature in lib, routes, and tests ✅
- Response fields `grantsEarned, used, adjustments, balance, hire_year, email, name` — same across GET / and GET /all ✅
- `leave_adjustments` fields `id, user_id, amount, note, created_by, created_at` — same across migration, route, and tests ✅
- `_adjustLeaveEmail` — used consistently in `openAdjustLeaveModal`, `closeAdjustLeaveModal`, `submitLeaveAdjustment` ✅
