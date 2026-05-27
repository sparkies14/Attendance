# Phase 8 — Appeals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `appeals` table and four API routes so members can appeal discipline records, leave decisions, and tardy/AWOL attendance marks, and admins can resolve them.

**Architecture:** One migration creates the polymorphic `appeals` table. One route file (`routes/appeals.js`) handles all four endpoints and is mounted at `/appeals` in `server.js`. Tests follow the same supertest + Supabase mock pattern as `routes/discipline.js`. The route file registers GET `/all` before GET `/` to prevent Express path confusion.

**Tech Stack:** Node.js/Express 4, Supabase JS v2 (PostgreSQL), Jest + supertest, `requireAuth` + `requireRole` middleware.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `migrations/012_create_appeals.sql` | Table DDL |
| Create | `routes/appeals.js` | All 4 appeal endpoints |
| Create | `tests/appeals.test.js` | Integration tests |
| Modify | `server.js` | Mount `/appeals` router |

---

### Task 1: Migration — `appeals` table

**Files:**
- Create: `migrations/012_create_appeals.sql`

- [ ] **Step 1: Write the migration file**

```sql
create table appeals (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references users(id) on delete cascade,
  target_type     text not null,
  target_id       text not null,
  reason          text not null,
  status          text not null default 'Pending',
  resolution_note text,
  resolved_by     text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
```

Save to `migrations/012_create_appeals.sql`.

- [ ] **Step 2: Verify the file**

```bash
cat migrations/012_create_appeals.sql
```

Expected: SQL content printed correctly.

- [ ] **Step 3: Commit**

```bash
git add migrations/012_create_appeals.sql
git commit -m "feat: add appeals migration"
```

> **Note for runner:** Execute this SQL in the Supabase SQL Editor before deploying the routes.

---

### Task 2: Test scaffold + `POST /appeals`

**Files:**
- Create: `tests/appeals.test.js`
- Create: `routes/appeals.js`

- [ ] **Step 1: Write the failing tests for POST /**

Create `tests/appeals.test.js` with this complete content:

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
const router   = require('../routes/appeals');

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
    update:      jest.fn(() => ch),
  };
  return ch;
}

function makeApp(role, email, userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email, role, user_id: userId }; next(); });
  app.use('/', router);
  return app;
}

const APPEAL = {
  id: 1,
  user_id: 'user-1',
  target_type: 'discipline',
  target_id: '1',
  reason: 'I was not warned verbally first.',
  status: 'Pending',
  resolution_note: null,
  resolved_by: null,
  resolved_at: null,
  created_at: '2026-05-27T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

/* ─── POST / ─── */
describe('POST /', () => {
  test('400 when target_type is invalid', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'unknown', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target_type/i);
  });

  test('400 when target_id is missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', reason: 'reason' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target_id/i);
  });

  test('400 when attendance target_id is not YYYY-MM-DD', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'attendance', target_id: 'not-a-date', reason: 'reason' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('400 when reason is missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'attendance', target_id: '2026-05-27' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  test('400 when reason is empty string', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'attendance', target_id: '2026-05-27', reason: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  test('404 when discipline record not found or not owned by member', async () => {
    supabase.from.mockReturnValueOnce(c(null)); // discipline_records lookup returns nothing
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '99', reason: 'reason' });
    expect(res.status).toBe(404);
  });

  test('404 when leave record not found or not owned by member', async () => {
    supabase.from.mockReturnValueOnce(c(null)); // leave_log lookup returns nothing
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'leave', target_id: '99', reason: 'reason' });
    expect(res.status).toBe(404);
  });

  test('409 when appeal already exists for this record', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1 }));  // discipline_records — record found
    supabase.from.mockReturnValueOnce(c({ id: 5 }));  // appeals duplicate check — already exists
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('201 on success — discipline appeal', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1 }));  // discipline_records — found
    supabase.from.mockReturnValueOnce(c(null));        // appeals duplicate check — none
    supabase.from.mockReturnValueOnce(c(APPEAL));      // insert
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '1', reason: 'I was not warned verbally first.' });
    expect(res.status).toBe(201);
    expect(res.body.appeal.target_type).toBe('discipline');
    expect(res.body.appeal.status).toBe('Pending');
    expect(res.body.appeal.resolution_note).toBeNull();
  });

  test('201 on success — attendance appeal (no record lookup)', async () => {
    supabase.from.mockReturnValueOnce(c(null));   // duplicate check — none
    supabase.from.mockReturnValueOnce(c({ ...APPEAL, target_type: 'attendance', target_id: '2026-05-27' })); // insert
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'attendance', target_id: '2026-05-27', reason: 'I was present that day.' });
    expect(res.status).toBe(201);
    expect(res.body.appeal.target_type).toBe('attendance');
  });

  test('500 when DB error on insert', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1 }));             // discipline_records — found
    supabase.from.mockReturnValueOnce(c(null));                   // duplicate check — none
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' })); // insert fails
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest tests/appeals.test.js --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../routes/appeals'`

- [ ] **Step 3: Create `routes/appeals.js` with POST / only**

```js
const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);

const VALID_TYPES = ['discipline', 'leave', 'attendance'];
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;

router.post('/', async (req, res) => {
  const { target_type, target_id, reason } = req.body || {};

  if (!target_type || !VALID_TYPES.includes(target_type)) {
    return res.status(400).json({ error: 'target_type must be one of: discipline, leave, attendance.' });
  }
  if (!target_id) {
    return res.status(400).json({ error: 'target_id is required.' });
  }
  if (target_type === 'attendance' && !DATE_RE.test(String(target_id))) {
    return res.status(400).json({ error: 'target_id must be a valid date in YYYY-MM-DD format for attendance appeals.' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'reason is required.' });
  }

  // Verify target record exists and belongs to the requesting member
  if (target_type === 'discipline') {
    const { data: rec, error: recErr } = await supabase
      .from('discipline_records').select('id').eq('id', target_id).eq('user_id', req.user.user_id).maybeSingle();
    if (recErr) return res.status(500).json({ error: recErr.message });
    if (!rec) return res.status(404).json({ error: 'Discipline record not found.' });
  }

  if (target_type === 'leave') {
    const { data: rec, error: recErr } = await supabase
      .from('leave_log').select('id').eq('id', target_id).eq('email', req.user.email).maybeSingle();
    if (recErr) return res.status(500).json({ error: recErr.message });
    if (!rec) return res.status(404).json({ error: 'Leave record not found.' });
  }

  // Check for duplicate appeal
  const { data: existing, error: dupErr } = await supabase
    .from('appeals').select('id').eq('user_id', req.user.user_id).eq('target_type', target_type).eq('target_id', String(target_id)).maybeSingle();
  if (dupErr) return res.status(500).json({ error: dupErr.message });
  if (existing) return res.status(409).json({ error: 'Appeal already exists for this record.' });

  const { data, error } = await supabase
    .from('appeals')
    .insert({ user_id: req.user.user_id, target_type, target_id: String(target_id), reason: reason.trim() })
    .select('id, user_id, target_type, target_id, reason, status, resolution_note, resolved_by, resolved_at, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ appeal: data });
});

module.exports = router;
```

- [ ] **Step 4: Run POST / tests — verify they pass**

```bash
npx jest tests/appeals.test.js --no-coverage --testNamePattern="POST /" 2>&1 | tail -10
```

Expected: PASS — 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add routes/appeals.js tests/appeals.test.js
git commit -m "feat: POST /appeals — submit an appeal"
```

---

### Task 3: `GET /appeals` (member's own appeals)

**Files:**
- Modify: `routes/appeals.js` (add GET /)
- Modify: `tests/appeals.test.js` (add GET / describe block)

- [ ] **Step 1: Add failing tests for GET /**

Append this block to `tests/appeals.test.js` (after the closing `});` of the POST / describe):

```js
/* ─── GET / ─── */
describe('GET /', () => {
  test('200 — returns own appeals sorted newest first', async () => {
    supabase.from.mockReturnValueOnce(c([APPEAL]));
    const res = await request(makeApp('member', 'ana@test.com')).get('/');
    expect(res.status).toBe(200);
    expect(res.body.appeals).toHaveLength(1);
    expect(res.body.appeals[0].target_type).toBe('discipline');
    expect(res.body.appeals[0].status).toBe('Pending');
  });

  test('200 — returns empty array when member has no appeals', async () => {
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('member', 'ana@test.com')).get('/');
    expect(res.status).toBe(200);
    expect(res.body.appeals).toHaveLength(0);
  });

  test('500 when DB error', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('member', 'ana@test.com')).get('/');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run GET / tests — verify they fail**

```bash
npx jest tests/appeals.test.js --no-coverage --testNamePattern="GET /" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Add GET / route to `routes/appeals.js`**

Insert before `module.exports = router;`:

```js
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('appeals')
    .select('id, target_type, target_id, reason, status, resolution_note, resolved_by, resolved_at, created_at')
    .eq('user_id', req.user.user_id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ appeals: data || [] });
});
```

- [ ] **Step 4: Run GET / tests — verify they pass**

```bash
npx jest tests/appeals.test.js --no-coverage --testNamePattern="GET /" 2>&1 | tail -10
```

Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add routes/appeals.js tests/appeals.test.js
git commit -m "feat: GET /appeals — member views own appeals"
```

---

### Task 4: `GET /appeals/all` (admin view)

**Files:**
- Modify: `routes/appeals.js` (add GET /all — must be registered BEFORE GET /)
- Modify: `tests/appeals.test.js` (add GET /all describe block)

> **Important:** Register `router.get('/all', ...)` BEFORE `router.get('/', ...)` in the file. Insert it between the POST / handler and the GET / handler.

- [ ] **Step 1: Add failing tests for GET /all**

Append this block to `tests/appeals.test.js`:

```js
/* ─── GET /all ─── */
describe('GET /all', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/all');
    expect(res.status).toBe(403);
  });

  test('200 — returns all appeals with member info, Pending first', async () => {
    const RESOLVED = { ...APPEAL, id: 2, status: 'Approved', resolved_at: '2026-05-27T01:00:00Z' };
    supabase.from.mockReturnValueOnce(c([RESOLVED, APPEAL])); // appeals (resolved first in raw data)
    supabase.from.mockReturnValueOnce(c([                     // users
      { id: 'user-1', email: 'ana@test.com', name: 'Ana Reyes' },
    ]));
    const res = await request(makeApp('admin', 'admin@test.com')).get('/all');
    expect(res.status).toBe(200);
    expect(res.body.appeals).toHaveLength(2);
    // Pending appeal should be first after sort
    expect(res.body.appeals[0].status).toBe('Pending');
    expect(res.body.appeals[0].email).toBe('ana@test.com');
    expect(res.body.appeals[0].name).toBe('Ana Reyes');
    expect(res.body.appeals[1].status).toBe('Approved');
  });

  test('500 when DB error on appeals query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com')).get('/all');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run GET /all tests — verify they fail**

```bash
npx jest tests/appeals.test.js --no-coverage --testNamePattern="GET /all" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Add GET /all route to `routes/appeals.js`**

Insert this block BEFORE the existing `router.get('/', ...)` handler:

```js
router.get('/all', requireRole('owner', 'admin'), async (req, res) => {
  const { data: appeals, error: appealErr } = await supabase
    .from('appeals')
    .select('id, user_id, target_type, target_id, reason, status, resolution_note, resolved_by, resolved_at, created_at');
  if (appealErr) return res.status(500).json({ error: appealErr.message });

  const { data: users, error: userErr } = await supabase
    .from('users').select('id, email, name');
  if (userErr) return res.status(500).json({ error: userErr.message });

  const userMap = {};
  for (const u of (users || [])) userMap[u.id] = u;

  const result = (appeals || []).map(a => ({
    ...a,
    email: (userMap[a.user_id] || {}).email || null,
    name:  (userMap[a.user_id] || {}).name  || null,
  })).sort((a, b) => {
    if (a.status === 'Pending' && b.status !== 'Pending') return -1;
    if (a.status !== 'Pending' && b.status === 'Pending') return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return res.json({ appeals: result });
});
```

- [ ] **Step 4: Run GET /all tests — verify they pass**

```bash
npx jest tests/appeals.test.js --no-coverage --testNamePattern="GET /all" 2>&1 | tail -10
```

Expected: PASS — 3 tests green.

- [ ] **Step 5: Run the full appeals test suite — confirm no regressions**

```bash
npx jest tests/appeals.test.js --no-coverage 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add routes/appeals.js tests/appeals.test.js
git commit -m "feat: GET /appeals/all — admin view of all appeals"
```

---

### Task 5: `POST /appeals/:id/resolve` + wire `server.js`

**Files:**
- Modify: `routes/appeals.js` (add POST /:id/resolve)
- Modify: `tests/appeals.test.js` (add POST /:id/resolve describe block)
- Modify: `server.js` (mount `/appeals` router)

- [ ] **Step 1: Add failing tests for POST /:id/resolve**

Append this block to `tests/appeals.test.js`:

```js
/* ─── POST /:id/resolve ─── */
describe('POST /:id/resolve', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/1/resolve').send({ outcome: 'Approved', note: 'valid' });
    expect(res.status).toBe(403);
  });

  test('400 when outcome is invalid', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/resolve').send({ outcome: 'Maybe', note: 'valid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/outcome/i);
  });

  test('400 when note is missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/resolve').send({ outcome: 'Approved' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/note/i);
  });

  test('400 when note is empty string', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/resolve').send({ outcome: 'Approved', note: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/note/i);
  });

  test('404 when appeal not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/99/resolve').send({ outcome: 'Rejected', note: 'no basis' });
    expect(res.status).toBe(404);
  });

  test('409 when appeal is already resolved', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1, status: 'Approved' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/resolve').send({ outcome: 'Rejected', note: 'too late' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already resolved/i);
  });

  test('200 on success — appeal marked Approved with note and resolved_by', async () => {
    const RESOLVED = {
      ...APPEAL,
      status: 'Approved',
      resolution_note: 'Tardy was a system error.',
      resolved_by: 'admin@test.com',
      resolved_at: '2026-05-27T01:00:00Z',
    };
    supabase.from.mockReturnValueOnce(c({ id: 1, status: 'Pending' })); // fetch
    supabase.from.mockReturnValueOnce(c(RESOLVED));                      // update
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/resolve').send({ outcome: 'Approved', note: 'Tardy was a system error.' });
    expect(res.status).toBe(200);
    expect(res.body.appeal.status).toBe('Approved');
    expect(res.body.appeal.resolution_note).toBe('Tardy was a system error.');
    expect(res.body.appeal.resolved_by).toBe('admin@test.com');
  });

  test('500 when DB error on update', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1, status: 'Pending' }));
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/resolve').send({ outcome: 'Approved', note: 'valid' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run resolve tests — verify they fail**

```bash
npx jest tests/appeals.test.js --no-coverage --testNamePattern="POST /:id/resolve" 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Add POST /:id/resolve route to `routes/appeals.js`**

Insert before `module.exports = router;`:

```js
router.post('/:id/resolve', requireRole('owner', 'admin'), async (req, res) => {
  const { outcome, note } = req.body || {};

  if (!outcome || !['Approved', 'Rejected'].includes(outcome)) {
    return res.status(400).json({ error: 'outcome must be "Approved" or "Rejected".' });
  }
  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'note is required.' });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid appeal id.' });
  }

  const { data: appeal, error: fetchErr } = await supabase
    .from('appeals').select('id, status').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!appeal) return res.status(404).json({ error: 'Appeal not found.' });
  if (appeal.status !== 'Pending') return res.status(409).json({ error: 'Appeal is already resolved.' });

  const { data, error } = await supabase
    .from('appeals')
    .update({ status: outcome, resolution_note: note.trim(), resolved_by: req.user.email, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, user_id, target_type, target_id, reason, status, resolution_note, resolved_by, resolved_at, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ appeal: data });
});
```

- [ ] **Step 4: Run resolve tests — verify they pass**

```bash
npx jest tests/appeals.test.js --no-coverage --testNamePattern="POST /:id/resolve" 2>&1 | tail -10
```

Expected: PASS — 8 tests green.

- [ ] **Step 5: Run the full appeals test suite**

```bash
npx jest tests/appeals.test.js --no-coverage 2>&1 | tail -10
```

Expected: All tests pass (target: ~25 tests).

- [ ] **Step 6: Mount the appeals router in `server.js`**

In `server.js`, add this line after the `app.use('/discipline', ...)` line:

```js
app.use('/appeals', require('./routes/appeals'));
```

The relevant section of `server.js` should look like:

```js
app.use('/leave-balance', require('./routes/leaveBalance'));
app.use('/discipline',    require('./routes/discipline'));
app.use('/appeals',       require('./routes/appeals'));
```

- [ ] **Step 7: Run the full test suite — confirm no regressions**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: All tests pass (177 existing + ~25 new).

- [ ] **Step 8: Commit**

```bash
git add routes/appeals.js tests/appeals.test.js server.js
git commit -m "feat: POST /appeals/:id/resolve + wire appeals router in server.js"
```
