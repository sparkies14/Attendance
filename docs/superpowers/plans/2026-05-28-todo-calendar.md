# Todo Calendar Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-day task/todo lists to the member calendar and give admins full visibility and management via a per-member Tasks modal and a team-wide weekly grid view.

**Architecture:** New `todos` table with `user_id + date` index. Single `routes/todos.js` handles both member CRUD and admin management. `memberData.js` is extended to return `todosByDate` counts so the calendar grid can show dot indicators without extra fetches. The member frontend adds a todo section to the existing day detail panel. The admin panel adds a Tasks modal per member and a "Team Tasks" tab with a week view.

**Tech Stack:** Node/Express + Supabase (backend), React/Next.js (member frontend), vanilla JS (admin panel).

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `migrations/013_create_todos.sql` | New todos table + index |
| Create | `routes/todos.js` | Member CRUD + admin endpoints |
| Create | `tests/todos.test.js` | Route tests |
| Modify | `server.js` | Register `/todos` route |
| Modify | `routes/memberData.js` | Extend response with `todosByDate` |
| Modify | `frontend/components/member/MemberDashboard.tsx` | Add `Todo` type + extend `MemberData` |
| Modify | `frontend/components/member/pages/CalendarPage.tsx` | Todos section in day detail panel + cell dots |
| Modify | `admin.html` | Per-member Tasks modal + Team Tasks tab |

---

## Task 1: Database Migration

**Files:**
- Create: `migrations/013_create_todos.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/013_create_todos.sql
create table todos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  text        text not null,
  completed   boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on todos (user_id, date);
```

- [ ] **Step 2: Run migration in Supabase**

Open the Supabase SQL Editor, paste and run the contents of `migrations/013_create_todos.sql`.

Verify with:
```sql
select column_name, data_type from information_schema.columns where table_name = 'todos';
```
Expected: columns `id`, `user_id`, `date`, `text`, `completed`, `created_by`, `created_at`, `updated_at`.

- [ ] **Step 3: Commit**

```bash
git add migrations/013_create_todos.sql
git commit -m "feat: add todos table migration"
```

---

## Task 2: Member CRUD Routes (with tests)

**Files:**
- Create: `routes/todos.js`
- Create: `tests/todos.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/todos.test.js
const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
  next();
});
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/todos');

function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:        (resolve) => resolve(result),
    catch:       () => Promise.resolve(result),
    select:      jest.fn(() => ch),
    eq:          jest.fn(() => ch),
    gte:         jest.fn(() => ch),
    lte:         jest.fn(() => ch),
    order:       jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single:      jest.fn(() => Promise.resolve(result)),
    insert:      jest.fn(() => ch),
    update:      jest.fn(() => ch),
    delete:      jest.fn(() => Promise.resolve({ error: null })),
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

const TODO = {
  id: 1, text: 'Finish report', completed: false,
  created_by: null, created_at: '2026-05-28T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

/* ─── GET / ─── */
describe('GET /', () => {
  test('400 when date missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });

  test('400 when date is invalid format', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/?date=28-05-2026');
    expect(res.status).toBe(400);
  });

  test('200 returns todos array', async () => {
    supabase.from.mockReturnValueOnce(c([TODO]));
    const res = await request(makeApp('member', 'ana@test.com')).get('/?date=2026-05-28');
    expect(res.status).toBe(200);
    expect(res.body.todos).toHaveLength(1);
    expect(res.body.todos[0].text).toBe('Finish report');
  });

  test('500 on db error', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'db error' }));
    const res = await request(makeApp('member', 'ana@test.com')).get('/?date=2026-05-28');
    expect(res.status).toBe(500);
  });
});

/* ─── POST / ─── */
describe('POST /', () => {
  test('400 when date missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ text: 'Do something' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });

  test('400 when text is blank', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ date: '2026-05-28', text: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/text/i);
  });

  test('201 creates and returns todo', async () => {
    supabase.from.mockReturnValueOnce(c(TODO));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ date: '2026-05-28', text: 'Finish report' });
    expect(res.status).toBe(201);
    expect(res.body.todo.text).toBe('Finish report');
  });
});

/* ─── PATCH /:id ─── */
describe('PATCH /:id', () => {
  test('400 when id is NaN', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .patch('/abc').send({ completed: true });
    expect(res.status).toBe(400);
  });

  test('400 when no fields provided', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .patch('/1').send({});
    expect(res.status).toBe(400);
  });

  test('404 when todo not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(404);
  });

  test('403 when member tries to update another user todo', async () => {
    supabase.from.mockReturnValueOnce(c({ user_id: 'other-user' }));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(403);
  });

  test('200 when member updates own todo', async () => {
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'user-1' }))
      .mockReturnValueOnce(c({ ...TODO, completed: true }));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.todo.completed).toBe(true);
  });

  test('200 when admin updates any todo', async () => {
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'other-user' }))
      .mockReturnValueOnce(c({ ...TODO, completed: true }));
    const res = await request(makeApp('admin', 'admin@test.com', 'admin-1'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(200);
  });
});

/* ─── DELETE /:id ─── */
describe('DELETE /:id', () => {
  test('404 when todo not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .delete('/1');
    expect(res.status).toBe(404);
  });

  test('403 when member deletes another user todo', async () => {
    supabase.from.mockReturnValueOnce(c({ user_id: 'other-user' }));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1'))
      .delete('/1');
    expect(res.status).toBe(403);
  });

  test('200 when member deletes own todo', async () => {
    const ch = c(null);
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'user-1' }))
      .mockReturnValueOnce(ch);
    const res = await request(makeApp('member', 'ana@test.com', 'user-1'))
      .delete('/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('200 when admin deletes any todo', async () => {
    const ch = c(null);
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'other-user' }))
      .mockReturnValueOnce(ch);
    const res = await request(makeApp('admin', 'admin@test.com', 'admin-1'))
      .delete('/1');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with "Cannot find module"**

```bash
npm test -- --testPathPattern=todos --no-coverage 2>&1 | tail -5
```
Expected: `Cannot find module '../routes/todos'`

- [ ] **Step 3: Write the member CRUD routes**

```js
// routes/todos.js
const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  }
  const { data, error } = await supabase
    .from('todos')
    .select('id, text, completed, created_by, created_at')
    .eq('user_id', req.user.user_id)
    .eq('date', date)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ todos: data });
});

router.post('/', async (req, res) => {
  const { date, text } = req.body || {};
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required.' });
  }
  const { data, error } = await supabase
    .from('todos')
    .insert({ user_id: req.user.user_id, date, text: text.trim() })
    .select('id, text, completed, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ todo: data });
});

router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
  const { text, completed } = req.body || {};
  if (text === undefined && completed === undefined) {
    return res.status(400).json({ error: 'text or completed is required.' });
  }
  const { data: existing, error: fetchErr } = await supabase
    .from('todos').select('user_id').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: 'Todo not found.' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  if (!isAdmin && existing.user_id !== req.user.user_id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const updates = { updated_at: new Date().toISOString() };
  if (text !== undefined) updates.text = text.trim();
  if (completed !== undefined) updates.completed = Boolean(completed);
  const { data, error } = await supabase
    .from('todos')
    .update(updates)
    .eq('id', id)
    .select('id, text, completed, created_by, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ todo: data });
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
  const { data: existing, error: fetchErr } = await supabase
    .from('todos').select('user_id').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: 'Todo not found.' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  if (!isAdmin && existing.user_id !== req.user.user_id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run member CRUD tests — verify they pass**

```bash
npm test -- --testPathPattern=todos --no-coverage 2>&1 | tail -10
```
Expected: all member CRUD tests pass (the admin tests not yet written will be skipped).

- [ ] **Step 5: Commit**

```bash
git add routes/todos.js tests/todos.test.js
git commit -m "feat: add todos route with member CRUD and tests"
```

---

## Task 3: Admin Routes + extend memberData

**Files:**
- Modify: `routes/todos.js` (append admin routes)
- Modify: `tests/todos.test.js` (append admin tests)
- Modify: `routes/memberData.js` (add todosByDate)

- [ ] **Step 1: Append admin tests to `tests/todos.test.js`**

Add after the existing DELETE tests:

```js
/* ─── GET /admin ─── */
describe('GET /admin', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/admin?user_id=user-2&date=2026-05-28');
    expect(res.status).toBe(403);
  });

  test('400 when user_id missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin?date=2026-05-28');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user_id/i);
  });

  test('400 when date invalid', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin?user_id=user-2&date=bad');
    expect(res.status).toBe(400);
  });

  test('200 returns todos for the user', async () => {
    supabase.from.mockReturnValueOnce(c([TODO]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin?user_id=user-2&date=2026-05-28');
    expect(res.status).toBe(200);
    expect(res.body.todos).toHaveLength(1);
  });
});

/* ─── POST /admin ─── */
describe('POST /admin', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/admin').send({ user_id: 'user-2', date: '2026-05-28', text: 'Task' });
    expect(res.status).toBe(403);
  });

  test('400 when user_id missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/admin').send({ date: '2026-05-28', text: 'Task' });
    expect(res.status).toBe(400);
  });

  test('201 creates todo for a member', async () => {
    supabase.from.mockReturnValueOnce(c({ ...TODO, created_by: 'admin@test.com' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/admin').send({ user_id: 'user-2', date: '2026-05-28', text: 'Task' });
    expect(res.status).toBe(201);
    expect(res.body.todo.created_by).toBe('admin@test.com');
  });
});

/* ─── GET /admin/week ─── */
describe('GET /admin/week', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/admin/week?week_start=2026-05-25');
    expect(res.status).toBe(403);
  });

  test('400 when week_start missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin/week');
    expect(res.status).toBe(400);
  });

  test('200 returns members and todos', async () => {
    supabase.from
      .mockReturnValueOnce(c([{ id: 'user-1', name: 'Ana', email: 'ana@test.com' }]))
      .mockReturnValueOnce(c([TODO]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin/week?week_start=2026-05-25');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.todos).toHaveLength(1);
  });
});

/* ─── GET /admin/month ─── */
describe('GET /admin/month', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/admin/month?user_id=user-1&month=5&year=2026');
    expect(res.status).toBe(403);
  });

  test('400 when user_id missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin/month?month=5&year=2026');
    expect(res.status).toBe(400);
  });

  test('200 returns todosByDate counts', async () => {
    supabase.from.mockReturnValueOnce(
      c([{ date: '2026-05-05' }, { date: '2026-05-05' }, { date: '2026-05-13' }])
    );
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin/month?user_id=user-1&month=5&year=2026');
    expect(res.status).toBe(200);
    expect(res.body.todosByDate['2026-05-05']).toBe(2);
    expect(res.body.todosByDate['2026-05-13']).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — verify new admin tests fail**

```bash
npm test -- --testPathPattern=todos --no-coverage 2>&1 | grep -E "FAIL|PASS|✓|✗|×" | head -20
```
Expected: existing member tests pass, admin tests fail with 404.

- [ ] **Step 3: Append admin routes to `routes/todos.js`**

Add before `module.exports = router;`:

```js
router.get('/admin', requireRole('owner', 'admin'), async (req, res) => {
  const { user_id, date } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  const { data, error } = await supabase
    .from('todos')
    .select('id, text, completed, created_by, created_at')
    .eq('user_id', user_id)
    .eq('date', date)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ todos: data });
});

router.post('/admin', requireRole('owner', 'admin'), async (req, res) => {
  const { user_id, date, text } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required.' });
  const { data, error } = await supabase
    .from('todos')
    .insert({ user_id, date, text: text.trim(), created_by: req.user.email })
    .select('id, text, completed, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ todo: data });
});

router.get('/admin/week', requireRole('owner', 'admin'), async (req, res) => {
  const { week_start } = req.query;
  if (!week_start || !DATE_RE.test(week_start)) {
    return res.status(400).json({ error: 'week_start must be YYYY-MM-DD.' });
  }
  const end = new Date(week_start);
  end.setDate(end.getDate() + 5);
  const endStr = end.toISOString().slice(0, 10);
  const [{ data: members, error: mErr }, { data: todos, error: tErr }] = await Promise.all([
    supabase.from('users').select('id, name, email').eq('status', 'Active').order('name'),
    supabase.from('todos')
      .select('id, user_id, date, text, completed, created_by')
      .gte('date', week_start)
      .lte('date', endStr)
      .order('created_at', { ascending: true }),
  ]);
  if (mErr) return res.status(500).json({ error: mErr.message });
  if (tErr) return res.status(500).json({ error: tErr.message });
  return res.json({ members: members || [], todos: todos || [] });
});

router.get('/admin/month', requireRole('owner', 'admin'), async (req, res) => {
  const { user_id, month, year } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  const m = parseInt(month), y = parseInt(year);
  if (isNaN(m) || isNaN(y)) return res.status(400).json({ error: 'month and year must be numbers.' });
  const mm = String(m).padStart(2, '0');
  const startDate = `${y}-${mm}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('todos').select('date')
    .eq('user_id', user_id)
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) return res.status(500).json({ error: error.message });
  const counts = {};
  for (const row of (data || [])) {
    counts[row.date] = (counts[row.date] || 0) + 1;
  }
  return res.json({ todosByDate: counts });
});
```

- [ ] **Step 4: Run all todos tests — verify they pass**

```bash
npm test -- --testPathPattern=todos --no-coverage 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 5: Extend `routes/memberData.js` to include `todosByDate`**

In the `Promise.all` block (line 26), add a fifth query:

```js
const [
  { data: allAttendance },
  { data: allLeave },
  { data: lunchToday },
  { data: breakToday },
  { data: monthTodos },
] = await Promise.all([
  supabase.from('attendance').select('*').eq('email', email),
  supabase.from('leave_log').select('*').eq('email', email),
  supabase.from('lunch_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
  supabase.from('break_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
  supabase.from('todos').select('date').eq('user_id', req.user.user_id)
    .gte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-01`)
    .lte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-${String(new Date(yearNum, monthNum, 0).getDate()).padStart(2,'0')}`),
]);
```

Then build a `todosByDate` map and include it in the response. Add before `res.json(...)`:

```js
const todosByDate = {};
for (const row of (monthTodos || [])) {
  const d = String(row.date).slice(0, 10); // ensure YYYY-MM-DD
  todosByDate[d] = (todosByDate[d] || 0) + 1;
}
```

Update `res.json(...)` to include the new field:

```js
res.json({
  month: monthNum,
  year: yearNum,
  email,
  calendar,
  summary,
  todosByDate,
  onLunch: !!(lunchToday && !lunchToday.lunch_in),
  onBreak: !!(breakToday && !breakToday.break_in),
  hadLunch: !!(lunchToday),
  leaveHistory,
});
```

- [ ] **Step 6: Run full test suite — verify nothing is broken**

```bash
npm test --no-coverage 2>&1 | tail -15
```
Expected: all existing tests still pass, todos tests pass.

- [ ] **Step 7: Commit**

```bash
git add routes/todos.js tests/todos.test.js routes/memberData.js
git commit -m "feat: add admin todo routes, month dots in memberData"
```

---

## Task 4: Register Routes in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the todos route registration**

In `server.js`, after the line `app.use('/appeals', require('./routes/appeals'));` add:

```js
app.use('/todos',  require('./routes/todos'));
```

- [ ] **Step 2: Start the server and smoke-test**

```bash
node server.js &
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/todos?date=2026-05-28
# Expected: 401 (unauthenticated — route is registered)
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: register todos route in server"
```

---

## Task 5: Member Frontend — Types and Cell Dots

**Files:**
- Modify: `frontend/components/member/MemberDashboard.tsx`
- Modify: `frontend/components/member/pages/CalendarPage.tsx`

- [ ] **Step 1: Add `Todo` interface and extend `MemberData` in `MemberDashboard.tsx`**

After the `CalendarDay` interface (around line 29), add:

```ts
export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  created_by: string | null;
  created_at: string;
}
```

In the `MemberData` interface, add the new field after `leaveHistory`:

```ts
export interface MemberData {
  month: number;
  year: number;
  email: string;
  calendar: CalendarDay[];
  summary: { present: number; late: number; absent: number; pending: number };
  onLunch: boolean;
  onBreak: boolean;
  hadLunch: boolean;
  leaveHistory: LeaveRecord[];
  todosByDate?: Record<string, number>;
}
```

- [ ] **Step 2: Add todo state and `toISO` helper import to `CalendarPage.tsx`**

At the top of the component function, after the existing state declarations, add:

```ts
import type { Todo } from '../MemberDashboard';
```

Add to the imports at the top of the file (after the existing import line):

```ts
import type { MemberData, CalendarDay, Todo } from '../MemberDashboard';
```

Replace the existing import line `import type { MemberData, CalendarDay } from '../MemberDashboard';` with the above.

Add the new state inside the component function after `const [appBusy, setAppBusy] = useState(false);`:

```ts
const [todos,       setTodos]       = useState<Todo[]>([]);
const [todosBusy,   setTodosBusy]   = useState(false);
const [todoErr,     setTodoErr]     = useState<string | null>(null);
const [showAddForm, setShowAddForm] = useState(false);
const [addText,     setAddText]     = useState('');
const [addBusy,     setAddBusy]     = useState(false);
```

- [ ] **Step 3: Add `fetchTodos` function to `CalendarPage.tsx`**

Add after the `submitAppeal` function:

```ts
async function fetchTodos(isoDate: string) {
  setTodosBusy(true); setTodoErr(null); setTodos([]);
  try {
    const r = await fetch(`${apiUrl}/todos?date=${isoDate}`, { credentials: 'include' });
    if (r.ok) setTodos((await r.json()).todos ?? []);
    else setTodoErr('Could not load tasks.');
  } catch { setTodoErr('Network error.'); }
  finally  { setTodosBusy(false); }
}

async function addTodo(isoDate: string) {
  if (!addText.trim()) return;
  setAddBusy(true);
  try {
    const r = await fetch(`${apiUrl}/todos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ date: isoDate, text: addText.trim() }),
    });
    if (r.ok) {
      const { todo } = await r.json();
      setTodos(prev => [...prev, todo]);
      setAddText(''); setShowAddForm(false);
    } else { setTodoErr('Could not save task.'); }
  } catch { setTodoErr('Network error.'); }
  finally  { setAddBusy(false); }
}

async function toggleTodo(id: number, completed: boolean) {
  const r = await fetch(`${apiUrl}/todos/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ completed }),
  });
  if (r.ok) {
    const { todo } = await r.json();
    setTodos(prev => prev.map(t => t.id === id ? todo : t));
  }
}

async function deleteTodo(id: number) {
  const r = await fetch(`${apiUrl}/todos/${id}`, { method: 'DELETE', credentials: 'include' });
  if (r.ok) setTodos(prev => prev.filter(t => t.id !== id));
}
```

- [ ] **Step 4: Call `fetchTodos` when a day is selected**

Find the `onClick` on the calendar cell (the `setSelected(isSel ? null : cell)` call) and update it:

```tsx
onClick={() => {
  if (!canSelect) return;
  if (isSel) {
    setSelected(null); setTodos([]); setShowAddForm(false); setTodoErr(null);
  } else {
    setSelected(cell);
    fetchTodos(toISO(cell.date));
    setShowAddForm(false); setTodoErr(null);
  }
}}
```

- [ ] **Step 5: Add purple dot indicator to calendar cells**

In the `navigate` function, update `setSelected(null)` call to also clear todos:

```ts
async function navigate(m: number, y: number) {
  setNavErr(null); setBusy(true); setSelected(null); setAppDay(null);
  setTodos([]); setShowAddForm(false); setTodoErr(null);
  // ... rest unchanged
```

Inside the calendar cell JSX, after the `{/* Hours */}` block, add:

```tsx
{/* Todo dot */}
{!cell.isWeekend && (data?.todosByDate?.[toISO(cell.date)] ?? 0) > 0 && (
  <div style={{
    position: 'absolute', bottom: 5, right: 6,
    width: 5, height: 5, borderRadius: '50%',
    background: isToday ? 'rgba(255,255,255,0.6)' : '#7c3aed',
  }} />
)}
```

- [ ] **Step 6: Add "Has tasks" to the legend**

In the legend section (the `Object.entries(STATUS_CONFIG).map(...)` block), after the map, add:

```tsx
<span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.04em' }}>
  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} />
  Has tasks
</span>
```

- [ ] **Step 7: Run TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/member/MemberDashboard.tsx frontend/components/member/pages/CalendarPage.tsx
git commit -m "feat: add todo types, state, fetch functions, and cell dot indicators"
```

---

## Task 6: Member Frontend — Todo Section in Day Detail Panel

**Files:**
- Modify: `frontend/components/member/pages/CalendarPage.tsx`

- [ ] **Step 1: Add the todo section JSX inside the day detail panel**

In the selected-day detail panel, find the end of the `{/* Appeal form */}` block and the closing `</div>` of the detail panel. Insert the todo section between the appeal block and the closing `</div>`:

```tsx
{/* ── Todos section ── */}
<div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 16 }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
    <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      Tasks for this day
    </span>
    {!showAddForm && (
      <button
        onClick={() => setShowAddForm(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 10px', fontSize: 11.5, fontFamily: F_SANS, color: C.text2, cursor: 'pointer' }}
      >
        + Add task
      </button>
    )}
  </div>

  {todoErr && <p style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{todoErr}</p>}
  {todosBusy && <p style={{ fontSize: 12, color: C.text3 }}>Loading…</p>}

  {!todosBusy && todos.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
      {todos.map(todo => (
        <div
          key={todo.id}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, background: C.surface2, border: `1px solid ${C.border}`, opacity: todo.completed ? 0.6 : 1 }}
        >
          {/* Checkbox */}
          <button
            onClick={() => toggleTodo(todo.id, !todo.completed)}
            style={{ width: 16, height: 16, borderRadius: 4, border: todo.completed ? 'none' : `1.5px solid ${C.borderStrong}`, background: todo.completed ? C.green : 'transparent', color: '#fff', fontSize: 10, flexShrink: 0, marginTop: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {todo.completed ? '✓' : ''}
          </button>
          {/* Text */}
          <span style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.4, textDecoration: todo.completed ? 'line-through' : 'none' }}>
            {todo.text}
          </span>
          {/* Delete */}
          <button
            onClick={() => deleteTodo(todo.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.text3, padding: '0 2px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )}

  {!todosBusy && todos.length === 0 && !showAddForm && (
    <p style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>No tasks for this day.</p>
  )}

  {showAddForm && (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <input
        autoFocus
        value={addText}
        onChange={e => setAddText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') addTodo(toISO(selected!.date)); if (e.key === 'Escape') { setShowAddForm(false); setAddText(''); } }}
        placeholder="What do you need to do?"
        style={{ flex: 1, padding: '7px 10px', border: `1px solid ${C.accentBorder}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, background: C.surface, color: C.text, outline: 'none' }}
      />
      <button
        onClick={() => addTodo(toISO(selected!.date))}
        disabled={addBusy || !addText.trim()}
        style={{ padding: '7px 12px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}
      >
        {addBusy ? '…' : 'Save'}
      </button>
      <button
        onClick={() => { setShowAddForm(false); setAddText(''); }}
        style={{ padding: '7px 10px', background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: F_SANS, cursor: 'pointer' }}
      >
        Cancel
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Build the frontend**

```bash
cd /home/erwindev/Attendance/frontend && npm run build 2>&1 | tail -10
```
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/member/pages/CalendarPage.tsx
git commit -m "feat: add todos section to day detail panel in member calendar"
```

---

## Task 7: Admin — Per-Member Tasks Modal

**Files:**
- Modify: `admin.html`

This task adds a "Tasks" button to each member row that opens a modal with a mini calendar and per-day todo management.

- [ ] **Step 1: Add the modal HTML**

In `admin.html`, find the last `</div>` before `</body>` and insert this modal before it:

```html
<!-- ── Member Tasks Modal ── -->
<div id="modal-member-tasks" class="modal-bg">
  <div class="modal" style="width:680px;max-width:95vw">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 id="tasks-modal-name" style="font-size:20px">Tasks</h2>
      <button class="btn" onclick="closeMemberTasksModal()" style="padding:4px 10px;font-size:18px;line-height:1">×</button>
    </div>

    <div style="display:flex;gap:20px;align-items:flex-start">
      <!-- Mini calendar -->
      <div style="flex-shrink:0;width:220px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <button class="btn" style="padding:4px 10px" onclick="shiftTasksMonth(-1)">←</button>
          <span id="tasks-month-label" style="font-family:'Instrument Serif',serif;font-size:16px"></span>
          <button class="btn" style="padding:4px 10px" onclick="shiftTasksMonth(1)">→</button>
        </div>
        <div id="tasks-mini-cal" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:11px"></div>
      </div>

      <!-- Day tasks panel -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span id="tasks-day-label" style="font-family:'Instrument Serif',serif;font-size:15px;color:var(--text2)">Select a day</span>
          <button class="btn btn-primary" style="font-size:12px;padding:5px 10px" onclick="openAssignTaskForm()">+ Assign task</button>
        </div>
        <div id="tasks-assign-form" style="display:none;margin-bottom:10px">
          <div style="display:flex;gap:6px">
            <input id="tasks-assign-input" class="modal input" style="flex:1;padding:7px 10px;font-size:13px" placeholder="Task description…">
            <button class="btn btn-primary" style="font-size:12px" onclick="submitAssignTask()">Save</button>
            <button class="btn" style="font-size:12px" onclick="closeAssignTaskForm()">Cancel</button>
          </div>
          <p id="tasks-assign-error" style="color:var(--red);font-size:12px;margin-top:4px"></p>
        </div>
        <div id="tasks-day-list" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto">
          <p style="font-size:12px;color:var(--text3)">Select a day on the calendar.</p>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add CSS for tasks modal mini-cal cells**

In the `<style>` block, add:

```css
.tasks-cal-cell {
  padding: 4px 2px; border-radius: 6px; text-align: center;
  font-size: 11px; cursor: pointer; border: 1.5px solid transparent;
  min-height: 28px; position: relative;
}
.tasks-cal-cell:hover { background: var(--accent-light); }
.tasks-cal-cell.has-todos::after {
  content: ''; position: absolute; bottom: 2px; right: 3px;
  width: 4px; height: 4px; border-radius: 50%; background: #6d28d9;
}
.tasks-cal-cell.selected { border-color: var(--amber); }
.tasks-cal-cell.weekend  { color: var(--text3); cursor: default; }
.tasks-cal-cell.weekend:hover { background: transparent; }
```

- [ ] **Step 3: Add Tasks button to member action buttons**

In `admin.html`, find the `actionButtons(u, isMe)` function. Inside the `const buttons = []` section, after the first `if (u.status !== 'Active' ...` line, add:

```js
buttons.push(`<button class="btn" onclick="openMemberTasksModal('${u.id}', ${JSON.stringify(u.name)})">Tasks</button>`);
```

Add it as the first button so it always appears regardless of status or role.

- [ ] **Step 4: Add Tasks modal JavaScript**

In `admin.html`, inside the `<script>` block before the closing `</script>`, add:

```js
let _tasksUserId  = null;
let _tasksYear    = new Date().getFullYear();
let _tasksMonth   = new Date().getMonth() + 1;
let _tasksSelDate = null;
let _tasksDots    = {};

const TASK_MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const TASK_DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function openMemberTasksModal(userId, name) {
  _tasksUserId = userId;
  _tasksYear   = new Date().getFullYear();
  _tasksMonth  = new Date().getMonth() + 1;
  _tasksSelDate = null;
  document.getElementById('tasks-modal-name').textContent = name + ' — Tasks';
  document.getElementById('tasks-day-label').textContent  = 'Select a day';
  document.getElementById('tasks-day-list').innerHTML     = '<p style="font-size:12px;color:var(--text3)">Select a day on the calendar.</p>';
  closeAssignTaskForm();
  loadTasksDots();
  document.getElementById('modal-member-tasks').classList.add('show');
}

function closeMemberTasksModal() {
  document.getElementById('modal-member-tasks').classList.remove('show');
}

async function loadTasksDots() {
  try {
    const res = await apiFetch(`${API_BASE}/todos/admin/month?user_id=${_tasksUserId}&month=${_tasksMonth}&year=${_tasksYear}`);
    const { todosByDate } = await res.json();
    _tasksDots = todosByDate || {};
  } catch { _tasksDots = {}; }
  renderTasksMiniCal();
}

function renderTasksMiniCal() {
  document.getElementById('tasks-month-label').textContent = `${TASK_MONTHS[_tasksMonth - 1]} ${_tasksYear}`;
  const firstDow = new Date(_tasksYear, _tasksMonth - 1, 1).getDay();
  const days     = new Date(_tasksYear, _tasksMonth, 0).getDate();
  let html = TASK_DOW.map(d => `<div style="text-align:center;font-size:10px;color:var(--text3);padding:2px 0;font-weight:600;">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) html += '<div></div>';
  for (let day = 1; day <= days; day++) {
    const dow  = new Date(_tasksYear, _tasksMonth - 1, day).getDay();
    const iso  = `${_tasksYear}-${String(_tasksMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isWk = dow === 0 || dow === 6;
    const isSel = iso === _tasksSelDate;
    const hasDot = !!_tasksDots[iso];
    const cls  = ['tasks-cal-cell', isWk ? 'weekend' : '', isSel ? 'selected' : '', hasDot ? 'has-todos' : ''].filter(Boolean).join(' ');
    const onclick = isWk ? '' : `onclick="selectTasksDay('${iso}', ${day})"`;
    html += `<div class="${cls}" ${onclick}>${day}</div>`;
  }
  document.getElementById('tasks-mini-cal').innerHTML = html;
}

function shiftTasksMonth(delta) {
  _tasksMonth += delta;
  if (_tasksMonth > 12) { _tasksMonth = 1;  _tasksYear++; }
  if (_tasksMonth < 1)  { _tasksMonth = 12; _tasksYear--; }
  _tasksSelDate = null;
  document.getElementById('tasks-day-label').textContent = 'Select a day';
  document.getElementById('tasks-day-list').innerHTML = '<p style="font-size:12px;color:var(--text3)">Select a day on the calendar.</p>';
  closeAssignTaskForm();
  loadTasksDots();
}

async function selectTasksDay(iso, day) {
  _tasksSelDate = iso;
  const dow = TASK_DOW[new Date(_tasksYear, _tasksMonth - 1, day).getDay()];
  document.getElementById('tasks-day-label').textContent = `${TASK_MONTHS[_tasksMonth - 1]} ${day}, ${_tasksYear} · ${dow}`;
  renderTasksMiniCal();
  closeAssignTaskForm();
  await loadDayTasks();
}

async function loadDayTasks() {
  const listEl = document.getElementById('tasks-day-list');
  listEl.innerHTML = '<p style="font-size:12px;color:var(--text3)">Loading…</p>';
  try {
    const res = await apiFetch(`${API_BASE}/todos/admin?user_id=${_tasksUserId}&date=${_tasksSelDate}`);
    const { todos, error } = await res.json();
    if (!res.ok) { listEl.innerHTML = `<p style="font-size:12px;color:var(--red)">${escapeHtml(error || 'Error loading tasks.')}</p>`; return; }
    renderDayTasks(todos || []);
  } catch (e) {
    listEl.innerHTML = `<p style="font-size:12px;color:var(--red)">${escapeHtml(e.message)}</p>`;
  }
}

function renderDayTasks(todos) {
  const listEl = document.getElementById('tasks-day-list');
  if (!todos.length) { listEl.innerHTML = '<p style="font-size:12px;color:var(--text3)">No tasks for this day.</p>'; return; }
  listEl.innerHTML = todos.map(t => `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;background:#fafaf8;border:1px solid var(--border);opacity:${t.completed ? 0.6 : 1}">
      <button onclick="adminToggleTodo(${t.id}, ${!t.completed})" style="width:16px;height:16px;border-radius:4px;border:${t.completed ? 'none' : '1.5px solid #ccc'};background:${t.completed ? 'var(--accent)' : 'transparent'};color:white;font-size:10px;flex-shrink:0;margin-top:1px;cursor:pointer">${t.completed ? '✓' : ''}</button>
      <span style="flex:1;font-size:13px;color:var(--text);line-height:1.4;text-decoration:${t.completed ? 'line-through' : 'none'}">${escapeHtml(t.text)}${t.created_by ? `<span style="font-size:10px;color:var(--text3);margin-left:6px">(assigned by ${escapeHtml(t.created_by)})</span>` : ''}</span>
      <button onclick="adminDeleteTodo(${t.id})" style="background:none;border:none;cursor:pointer;font-size:13px;color:#ccc;padding:0 2px">×</button>
    </div>
  `).join('');
}

async function adminToggleTodo(id, completed) {
  try {
    const res = await apiFetch(`${API_BASE}/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) });
    if (res.ok) await loadDayTasks();
  } catch {}
}

async function adminDeleteTodo(id) {
  try {
    const res = await apiFetch(`${API_BASE}/todos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadDayTasks();
      await loadTasksDots();
    }
  } catch {}
}

function openAssignTaskForm() {
  if (!_tasksSelDate) { showStatus('error', 'Select a day first.'); return; }
  document.getElementById('tasks-assign-form').style.display = 'block';
  document.getElementById('tasks-assign-input').value = '';
  document.getElementById('tasks-assign-error').textContent = '';
  document.getElementById('tasks-assign-input').focus();
}

function closeAssignTaskForm() {
  document.getElementById('tasks-assign-form').style.display = 'none';
}

async function submitAssignTask() {
  const text  = document.getElementById('tasks-assign-input').value.trim();
  const errEl = document.getElementById('tasks-assign-error');
  errEl.textContent = '';
  if (!text) { errEl.textContent = 'Task text is required.'; return; }
  try {
    const res = await apiFetch(`${API_BASE}/todos/admin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: _tasksUserId, date: _tasksSelDate, text }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Failed to assign task.'; return; }
    closeAssignTaskForm();
    await loadDayTasks();
    await loadTasksDots();
  } catch (e) { errEl.textContent = e.message; }
}
```

- [ ] **Step 5: Open `admin.html` in a browser and verify**

Start the server (`node server.js`) and open `admin.html`. Log in as admin, go to Members. Verify:
- Each member row has a "Tasks" button
- Clicking "Tasks" opens the modal with a mini calendar
- Month navigation works (← →)
- Selecting a weekday loads the tasks panel for that date
- "+ Assign task" requires a day to be selected first

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "feat: add per-member Tasks modal to admin panel"
```

---

## Task 8: Admin — Team Tasks Week View Tab

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add "Team Tasks" to the nav and `switchPage`**

Find the `switchPage` function. Update the `pages` array and `titles` object:

```js
const pages = ['users', 'audit', 'tardy', 'holidays', 'policy', 'leave-balance', 'tasks'];
const titles = {
  users:          'User Management',
  audit:          'Audit Log',
  tardy:          'Tardy Report',
  holidays:       'Holidays',
  policy:         'Policy Config',
  'leave-balance': 'Leave Balances',
  tasks:          'Team Tasks',
};
```

Also inside `switchPage`, add `tasks` to the `loaded` loading logic if there is any (check the existing function for the pattern). Append this at the end of `switchPage`:

```js
if (name === 'tasks') loadTeamTasks();
```

Find the `<div class="actions">` in the HTML header and add a new button after the last existing nav button:

```html
<button class="btn" onclick="switchPage('tasks')">Team Tasks</button>
```

- [ ] **Step 2: Add the Team Tasks page HTML**

Find the last `<div id="page-...">` block in the HTML (likely `page-leave-balance`). After its closing `</div>`, add:

```html
<div id="page-tasks" style="display:none">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div>
      <h2 style="font-family:'Instrument Serif',serif;font-size:26px;font-weight:normal">Team Tasks</h2>
      <p id="tasks-week-label" style="font-size:13px;color:var(--text2);margin-top:4px"></p>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="shiftWeek(-1)">← Prev week</button>
      <button class="btn" onclick="shiftWeek(1)">Next week →</button>
    </div>
  </div>
  <div id="tasks-week-grid" style="overflow-x:auto"></div>
</div>
```

- [ ] **Step 3: Add CSS for the week grid**

In the `<style>` block, add:

```css
.week-grid {
  display: grid;
  gap: 1px; background: var(--border);
  border-radius: 12px; overflow: hidden;
  min-width: 700px;
}
.wg-head {
  background: #fafaf8; padding: 8px 10px;
  font-size: 11px; font-weight: 600; color: var(--text2);
  text-transform: uppercase; letter-spacing: 0.06em;
  text-align: center; min-height: 44px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 1px;
}
.wg-head.today-col { background: var(--accent-light); color: var(--accent); }
.wg-head.weekend-col { background: #f9f8f6; }
.wg-member-cell {
  background: #fafaf8; padding: 8px 12px;
  display: flex; align-items: center; gap: 8px;
}
.wg-cell {
  background: white; padding: 6px 8px;
  min-height: 56px; vertical-align: top;
}
.wg-cell.today-col { background: rgba(26,107,60,0.03); }
.wg-cell.weekend-col { background: #f9f8f6; }
.wg-todo-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 7px; border-radius: 5px; font-size: 11px;
  color: #6d28d9; background: rgba(109,40,217,0.07);
  margin-bottom: 3px; max-width: 100%; cursor: pointer;
}
.wg-todo-pill.done { color: var(--text3); background: #f1f1ef; text-decoration: line-through; }
.wg-todo-pill .pip { width: 4px; height: 4px; border-radius: 50%; background: #6d28d9; flex-shrink: 0; }
.wg-todo-pill.done .pip { background: var(--text3); }
.wg-pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; display: inline-block; }
```

- [ ] **Step 4: Add Team Tasks JavaScript**

Inside the `<script>` block, add:

```js
let _weekStart = null; // ISO string YYYY-MM-DD of the Monday

function getMonday(d) {
  const date = new Date(d);
  const day  = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function isoToDisplay(iso) {
  const [y, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

function addDays(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function loadTeamTasks() {
  if (!_weekStart) _weekStart = getMonday(new Date());
  fetchTeamTasks();
}

function shiftWeek(delta) {
  _weekStart = addDays(_weekStart, delta * 7);
  fetchTeamTasks();
}

async function fetchTeamTasks() {
  const gridEl = document.getElementById('tasks-week-grid');
  gridEl.innerHTML = '<p style="padding:16px;color:var(--text2)">Loading…</p>';
  const todayISO = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: 6 }, (_, i) => addDays(_weekStart, i));
  const endISO = days[5];
  const [y1, m1, d1] = _weekStart.split('-');
  const [y2, m2, d2] = endISO.split('-');
  document.getElementById('tasks-week-label').textContent =
    `Week of ${parseInt(m1)}/${parseInt(d1)}/${y1} – ${parseInt(m2)}/${parseInt(d2)}/${y2}`;
  try {
    const res = await apiFetch(`${API_BASE}/todos/admin/week?week_start=${_weekStart}`);
    const { members, todos, error } = await res.json();
    if (!res.ok) { gridEl.innerHTML = `<p style="padding:16px;color:var(--red)">${escapeHtml(error || 'Error loading.')}</p>`; return; }
    renderWeekGrid(members || [], todos || [], days, todayISO);
  } catch (e) {
    gridEl.innerHTML = `<p style="padding:16px;color:var(--red)">${escapeHtml(e.message)}</p>`;
  }
}

const TEAM_DOW = ['Mon','Tue','Wed','Thu','Fri','Sat'];

function renderWeekGrid(members, todos, days, todayISO) {
  const gridEl = document.getElementById('tasks-week-grid');
  const cols   = 1 + days.length;
  const isWkEnd = (iso) => { const d = new Date(iso).getDay(); return d === 0 || d === 6; };

  let html = `<div class="week-grid" style="grid-template-columns:160px repeat(${days.length},1fr)">`;

  // Header row
  html += `<div class="wg-head" style="text-align:left">Member</div>`;
  days.forEach((iso, i) => {
    const [,, d] = iso.split('-');
    const isToday = iso === todayISO;
    const cls = isToday ? 'wg-head today-col' : isWkEnd(iso) ? 'wg-head weekend-col' : 'wg-head';
    html += `<div class="${cls}"><span style="font-size:10px">${isToday ? TEAM_DOW[i] + ' · TODAY' : TEAM_DOW[i]}</span><span style="font-family:'Instrument Serif',serif;font-size:18px">${parseInt(d)}</span></div>`;
  });

  // Member rows
  if (!members.length) {
    html += `<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text2)">No active members.</div>`;
  }
  members.forEach(m => {
    const initials = m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    html += `<div class="wg-member-cell">
      <div style="width:26px;height:26px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:var(--accent);flex-shrink:0">${escapeHtml(initials)}</div>
      <div><div style="font-size:12.5px;font-weight:500">${escapeHtml(m.name)}</div></div>
    </div>`;
    days.forEach(iso => {
      const isToday = iso === todayISO;
      const isWknd  = isWkEnd(iso);
      const cls     = isToday ? 'wg-cell today-col' : isWknd ? 'wg-cell weekend-col' : 'wg-cell';
      const dayTodos = todos.filter(t => t.user_id === m.id && String(t.date).slice(0, 10) === iso);
      const pills = dayTodos.map(t =>
        `<div class="wg-todo-pill ${t.completed ? 'done' : ''}" title="${escapeHtml(t.text)}" onclick="openMemberTasksModal('${m.id}', ${JSON.stringify(m.name)})">
          <span class="pip"></span><span class="wg-pill-text">${escapeHtml(t.text)}</span>
        </div>`
      ).join('');
      html += `<div class="${cls}">${pills}</div>`;
    });
  });

  html += '</div>';
  gridEl.innerHTML = html;
}
```

- [ ] **Step 5: Open `admin.html` in a browser and verify**

Start the server, open `admin.html`, log in as admin. Click "Team Tasks":
- Week grid loads with all active members as rows and Mon–Sat as columns.
- Today's column is highlighted green.
- Todo pills appear in cells for days that have tasks.
- Clicking a pill opens the member Tasks modal for that member.
- Week navigation shifts the grid by 7 days.

- [ ] **Step 6: Run full test suite one final time**

```bash
cd /home/erwindev/Attendance && npm test --no-coverage 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 7: Final commit**

```bash
git add admin.html
git commit -m "feat: add Team Tasks week-view tab to admin panel"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `todos` table with `user_id`, `date`, `text`, `completed`, `created_by` → Task 1
- ✅ Member: GET/POST/PATCH/DELETE todos → Task 2
- ✅ Admin: GET by member+date, POST assign, GET week view → Task 3
- ✅ Dot indicators on member calendar cells → Task 5
- ✅ Todos section in day detail panel with add/toggle/delete → Task 6
- ✅ Per-member Tasks modal in admin → Task 7
- ✅ Team Tasks week-view tab in admin → Task 8
- ✅ Admin: month dots in per-member modal → Task 7 (`/todos/admin/month`)
- ✅ `todosByDate` in memberData response → Task 3

**Placeholder scan:** No TBDs or stubs. All steps contain exact code. ✓

**Type consistency:**
- `Todo` interface defined in Task 5, used in CalendarPage Task 5 & 6. ✓
- `fetchTodos`, `addTodo`, `toggleTodo`, `deleteTodo` defined in Task 5, called in Task 6. ✓
- `_tasksUserId`, `_tasksSelDate` set in Task 7, used throughout Task 7. ✓
- Route paths `/todos/admin`, `/todos/admin/week`, `/todos/admin/month` consistent across Tasks 3, 7, 8. ✓
