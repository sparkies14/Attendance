# Phase 5 — Progressive Discipline Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `discipline_records` table and five API routes so admins can issue, view, void, and acknowledge written warnings for members.

**Architecture:** One new migration creates the table. One new route file (`routes/discipline.js`) handles all five endpoints and is mounted at `/discipline` in `server.js`. Tests live in `tests/discipline.test.js` and use the same supertest + mock pattern as the rest of the codebase.

**Tech Stack:** Node.js/Express 4, Supabase JS v2 (PostgreSQL), Jest + supertest, `requireAuth` + `requireRole` middleware.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `migrations/011_create_discipline_records.sql` | Table DDL |
| Create | `routes/discipline.js` | All 5 discipline endpoints |
| Create | `tests/discipline.test.js` | Integration tests |
| Modify | `server.js` | Mount `/discipline` router |

---

### Task 1: Migration — `discipline_records` table

**Files:**
- Create: `migrations/011_create_discipline_records.sql`

- [ ] **Step 1: Write the migration file**

```sql
create table discipline_records (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references users(id) on delete cascade,
  reason          text not null,
  issued_by       text not null,
  issued_at       timestamptz not null default now(),
  voided          boolean not null default false,
  void_reason     text,
  voided_by       text,
  voided_at       timestamptz,
  acknowledged    boolean not null default false,
  acknowledged_at timestamptz
);
```

Save to `migrations/011_create_discipline_records.sql`.

- [ ] **Step 2: Verify the file exists**

```bash
cat migrations/011_create_discipline_records.sql
```

Expected: SQL content printed with no errors.

- [ ] **Step 3: Commit**

```bash
git add migrations/011_create_discipline_records.sql
git commit -m "feat: add discipline_records migration"
```

> **Note for runner:** This migration must be executed manually in the Supabase SQL Editor. The file serves as the source of truth and record for review.

---

### Task 2: Test scaffold + `POST /discipline` (issue warning)

**Files:**
- Create: `tests/discipline.test.js`
- Create: `routes/discipline.js`

- [ ] **Step 1: Write the failing tests for POST /**

Create `tests/discipline.test.js` with this content:

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
const router   = require('../routes/discipline');

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

function makeApp(role, email) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email, role }; next(); });
  app.use('/', router);
  return app;
}

const RECORD = {
  id: 1, user_id: 'user-1', reason: '5 minor tardies',
  issued_by: 'admin@test.com', issued_at: '2026-05-27T00:00:00Z',
  voided: false, void_reason: null, voided_by: null, voided_at: null,
  acknowledged: false, acknowledged_at: null,
};

beforeEach(() => jest.clearAllMocks());

/* ─── POST / ─── */
describe('POST /', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ email: 'ana@test.com', reason: '5 tardies' });
    expect(res.status).toBe(403);
  });

  test('400 when email missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/').send({ reason: '5 tardies' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('400 when reason missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/').send({ email: 'ana@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  test('400 when reason is empty string', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/').send({ email: 'ana@test.com', reason: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  test('404 when member not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/').send({ email: 'ghost@test.com', reason: '5 tardies' });
    expect(res.status).toBe(404);
  });

  test('201 on success — stores reason and issued_by', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 'user-1' })); // users lookup
    supabase.from.mockReturnValueOnce(c(RECORD));            // insert
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/').send({ email: 'ana@test.com', reason: '5 minor tardies' });
    expect(res.status).toBe(201);
    expect(res.body.record.reason).toBe('5 minor tardies');
    expect(res.body.record.issued_by).toBe('admin@test.com');
    expect(res.body.record.voided).toBe(false);
    expect(res.body.record.acknowledged).toBe(false);
  });

  test('500 when DB error on user lookup', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/').send({ email: 'ana@test.com', reason: '5 tardies' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest tests/discipline.test.js --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../routes/discipline'`

- [ ] **Step 3: Create `routes/discipline.js` with POST / only**

```js
const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);

router.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const { email, reason } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required.' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id').eq('email', email).eq('status', 'Active').neq('role', 'owner').maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Active member not found.' });

  const { data, error } = await supabase
    .from('discipline_records')
    .insert({ user_id: user.id, reason: reason.trim(), issued_by: req.user.email })
    .select('id, user_id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ record: data });
});

module.exports = router;
```

- [ ] **Step 4: Run POST / tests — verify they pass**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="POST /" 2>&1 | tail -15
```

Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add routes/discipline.js tests/discipline.test.js
git commit -m "feat: POST /discipline — issue written warning"
```

---

### Task 3: `GET /discipline?email=` (list warnings for a member)

**Files:**
- Modify: `routes/discipline.js` (add GET /)
- Modify: `tests/discipline.test.js` (add GET / describe block)

- [ ] **Step 1: Add failing tests for GET /**

Append this block to `tests/discipline.test.js` (after the closing `});` of the POST / describe):

```js
/* ─── GET / ─── */
describe('GET /', () => {
  test('400 when email missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('403 when member accesses another member', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/?email=other@test.com');
    expect(res.status).toBe(403);
  });

  test('404 when user not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/?email=ana@test.com');
    expect(res.status).toBe(404);
  });

  test('200 — member can access own warnings', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 'user-1' }));  // users lookup
    supabase.from.mockReturnValueOnce(c([RECORD]));           // discipline_records
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/?email=ana@test.com');
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].reason).toBe('5 minor tardies');
  });

  test('200 — admin can access any member warnings', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 'user-1' }));
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/?email=ana@test.com');
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(0);
  });

  test('500 when DB error on user lookup', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/?email=ana@test.com');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run GET / tests — verify they fail**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="GET /" 2>&1 | tail -15
```

Expected: FAIL — 404 responses or wrong body.

- [ ] **Step 3: Add GET / route to `routes/discipline.js`**

Insert before `module.exports = router;`:

```js
router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param required.' });
  const elevated = ['owner', 'admin'].includes(req.user.role);
  if (!elevated && req.user.email !== email) return res.status(403).json({ error: 'Forbidden.' });

  const { data: user, error: userErr } = await supabase
    .from('users').select('id').eq('email', email).maybeSingle();
  if (userErr) return res.status(500).json({ error: userErr.message });
  if (!user) return res.status(404).json({ error: 'Member not found.' });

  const { data, error } = await supabase
    .from('discipline_records')
    .select('id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at')
    .eq('user_id', user.id)
    .order('issued_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ records: data || [] });
});
```

- [ ] **Step 4: Run GET / tests — verify they pass**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="GET /" 2>&1 | tail -15
```

Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add routes/discipline.js tests/discipline.test.js
git commit -m "feat: GET /discipline — list member warnings"
```

---

### Task 4: `GET /discipline/all` (admin view of all members)

**Files:**
- Modify: `routes/discipline.js` (add GET /all — must be registered BEFORE GET /)
- Modify: `tests/discipline.test.js` (add GET /all describe block)

> **Important:** Register `router.get('/all', ...)` in the route file BEFORE `router.get('/', ...)` to prevent Express from matching the literal path `/all` as the `?email=` query endpoint.

- [ ] **Step 1: Add failing tests for GET /all**

Append this block to `tests/discipline.test.js`:

```js
/* ─── GET /all ─── */
describe('GET /all', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/all');
    expect(res.status).toBe(403);
  });

  test('200 — returns all active members sorted by name with counts', async () => {
    supabase.from.mockReturnValueOnce(c([
      { id: 'user-1', email: 'ana@test.com', name: 'Ana Reyes' },
      { id: 'user-2', email: 'ben@test.com', name: 'Ben Cruz' },
    ])); // users
    supabase.from.mockReturnValueOnce(c([
      { ...RECORD, user_id: 'user-1', voided: false },
      { ...RECORD, id: 2, user_id: 'user-1', voided: true },
    ])); // discipline_records
    const res = await request(makeApp('admin', 'admin@test.com')).get('/all');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(2);
    const ana = res.body.members.find(m => m.email === 'ana@test.com');
    expect(ana.totalWarnings).toBe(2);
    expect(ana.activeWarnings).toBe(1);
    const ben = res.body.members.find(m => m.email === 'ben@test.com');
    expect(ben.totalWarnings).toBe(0);
    expect(ben.activeWarnings).toBe(0);
  });

  test('500 when DB error on members query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com')).get('/all');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run GET /all tests — verify they fail**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="GET /all" 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Add GET /all route to `routes/discipline.js`**

Insert this block BEFORE the existing `router.get('/', ...)` handler (i.e., between the `router.use(requireAuth)` line and the `router.get('/',` line):

```js
router.get('/all', requireRole('owner', 'admin'), async (req, res) => {
  const { data: members, error: membersErr } = await supabase
    .from('users').select('id, email, name').eq('status', 'Active').neq('role', 'owner');
  if (membersErr) return res.status(500).json({ error: membersErr.message });

  const { data: allRecords, error: recErr } = await supabase
    .from('discipline_records')
    .select('id, user_id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at');
  if (recErr) return res.status(500).json({ error: recErr.message });

  const result = (members || []).map(m => {
    const records = (allRecords || []).filter(r => r.user_id === m.id);
    return {
      email: m.email,
      name: m.name,
      totalWarnings: records.length,
      activeWarnings: records.filter(r => !r.voided).length,
      records,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return res.json({ members: result });
});
```

- [ ] **Step 4: Run GET /all tests — verify they pass**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="GET /all" 2>&1 | tail -15
```

Expected: PASS — 3 tests green.

- [ ] **Step 5: Run full test file to confirm nothing regressed**

```bash
npx jest tests/discipline.test.js --no-coverage 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add routes/discipline.js tests/discipline.test.js
git commit -m "feat: GET /discipline/all — admin overview of all member warnings"
```

---

### Task 5: `POST /discipline/:id/void` (void a warning)

**Files:**
- Modify: `routes/discipline.js` (add POST /:id/void)
- Modify: `tests/discipline.test.js` (add POST /:id/void describe block)

- [ ] **Step 1: Add failing tests for POST /:id/void**

Append this block to `tests/discipline.test.js`:

```js
/* ─── POST /:id/void ─── */
describe('POST /:id/void', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/1/void').send({ reason: 'issued in error' });
    expect(res.status).toBe(403);
  });

  test('400 when reason missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/void').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  test('400 when reason is empty string', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/void').send({ reason: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  test('404 when record not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/99/void').send({ reason: 'error' });
    expect(res.status).toBe(404);
  });

  test('409 when warning is already voided', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1, voided: true }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/void').send({ reason: 'error' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already voided/i);
  });

  test('200 on success — record marked voided', async () => {
    const VOIDED = { ...RECORD, voided: true, void_reason: 'issued in error', voided_by: 'admin@test.com', voided_at: '2026-05-27T01:00:00Z' };
    supabase.from.mockReturnValueOnce(c({ id: 1, voided: false })); // fetch
    supabase.from.mockReturnValueOnce(c(VOIDED));                   // update
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/void').send({ reason: 'issued in error' });
    expect(res.status).toBe(200);
    expect(res.body.record.voided).toBe(true);
    expect(res.body.record.void_reason).toBe('issued in error');
    expect(res.body.record.voided_by).toBe('admin@test.com');
  });

  test('500 when DB error on update', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1, voided: false }));        // fetch
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));   // update
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/void').send({ reason: 'issued in error' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run void tests — verify they fail**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="POST /:id/void" 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Add POST /:id/void route to `routes/discipline.js`**

Insert before `module.exports = router;`:

```js
router.post('/:id/void', requireRole('owner', 'admin'), async (req, res) => {
  const { reason } = req.body || {};
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required.' });

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid record id.' });

  const { data: record, error: fetchErr } = await supabase
    .from('discipline_records').select('id, voided').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (record.voided) return res.status(409).json({ error: 'Warning is already voided.' });

  const { data, error } = await supabase
    .from('discipline_records')
    .update({ voided: true, void_reason: reason.trim(), voided_by: req.user.email, voided_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, user_id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ record: data });
});
```

- [ ] **Step 4: Run void tests — verify they pass**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="POST /:id/void" 2>&1 | tail -15
```

Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add routes/discipline.js tests/discipline.test.js
git commit -m "feat: POST /discipline/:id/void — void a warning with reason"
```

---

### Task 6: `POST /discipline/:id/acknowledge` + wire `server.js`

**Files:**
- Modify: `routes/discipline.js` (add POST /:id/acknowledge)
- Modify: `tests/discipline.test.js` (add POST /:id/acknowledge describe block)
- Modify: `server.js` (mount `/discipline` router)

- [ ] **Step 1: Add failing tests for POST /:id/acknowledge**

Append this block to `tests/discipline.test.js`:

```js
/* ─── POST /:id/acknowledge ─── */
describe('POST /:id/acknowledge', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/1/acknowledge');
    expect(res.status).toBe(403);
  });

  test('404 when record not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/99/acknowledge');
    expect(res.status).toBe(404);
  });

  test('409 when warning is voided', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1, voided: true, acknowledged: false }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/acknowledge');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/voided/i);
  });

  test('200 on success — record marked acknowledged', async () => {
    const ACKED = { ...RECORD, acknowledged: true, acknowledged_at: '2026-05-27T02:00:00Z' };
    supabase.from.mockReturnValueOnce(c({ id: 1, voided: false, acknowledged: false })); // fetch
    supabase.from.mockReturnValueOnce(c(ACKED));                                          // update
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/acknowledge');
    expect(res.status).toBe(200);
    expect(res.body.record.acknowledged).toBe(true);
    expect(res.body.record.acknowledged_at).toBe('2026-05-27T02:00:00Z');
  });

  test('500 when DB error on update', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1, voided: false, acknowledged: false }));
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/1/acknowledge');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
```

- [ ] **Step 2: Run acknowledge tests — verify they fail**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="POST /:id/acknowledge" 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Add POST /:id/acknowledge route to `routes/discipline.js`**

Insert before `module.exports = router;`:

```js
router.post('/:id/acknowledge', requireRole('owner', 'admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid record id.' });

  const { data: record, error: fetchErr } = await supabase
    .from('discipline_records').select('id, voided, acknowledged').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (record.voided) return res.status(409).json({ error: 'Cannot acknowledge a voided warning.' });

  const { data, error } = await supabase
    .from('discipline_records')
    .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, user_id, reason, issued_by, issued_at, voided, void_reason, voided_by, voided_at, acknowledged, acknowledged_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ record: data });
});
```

- [ ] **Step 4: Run acknowledge tests — verify they pass**

```bash
npx jest tests/discipline.test.js --no-coverage --testNamePattern="POST /:id/acknowledge" 2>&1 | tail -15
```

Expected: PASS — 5 tests green.

- [ ] **Step 5: Run the full discipline test suite**

```bash
npx jest tests/discipline.test.js --no-coverage 2>&1 | tail -10
```

Expected: All tests pass (target: ~28 tests).

- [ ] **Step 6: Mount the discipline router in `server.js`**

In `server.js`, add this line after the `app.use('/leave-balance', ...)` line:

```js
app.use('/discipline', require('./routes/discipline'));
```

The relevant section of `server.js` should look like:

```js
app.use('/leave', require('./routes/leaveEvidence'));
app.use('/leave-balance', require('./routes/leaveBalance'));
app.use('/discipline', require('./routes/discipline'));
```

- [ ] **Step 7: Run the full test suite to confirm no regressions**

```bash
npx jest --no-coverage 2>&1 | tail -15
```

Expected: All tests pass (147 existing + ~28 new).

- [ ] **Step 8: Commit**

```bash
git add routes/discipline.js tests/discipline.test.js server.js
git commit -m "feat: POST /discipline/:id/acknowledge + wire discipline router in server.js"
```
