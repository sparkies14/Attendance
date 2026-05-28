# Plan Events Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the todo system with a time-blocked plan events system on the "Calendar · plan" tab — members schedule activities like "Meeting with AT — 1pm to 3pm" for any calendar day.

**Architecture:** New `plan_events` table (with `start_time`/`end_time`/`title`) replaces `todos`. New `routes/planEvents.js` replaces `routes/todos.js`. `CalendarPage.tsx` day panel replaces the Tasks section with a Day Plan section. Admin panel updated to show time ranges.

**Tech Stack:** Node/Express + Supabase (backend), React/Next.js (member frontend), vanilla JS (admin panel).

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `migrations/014_create_plan_events.sql` | New plan_events table |
| Create | `migrations/015_drop_todos.sql` | Drop old todos table |
| Create | `routes/planEvents.js` | Member CRUD + admin endpoints |
| Create | `tests/planEvents.test.js` | Route tests (replaces todos tests) |
| Delete | `routes/todos.js` | Replaced by planEvents.js |
| Delete | `tests/todos.test.js` | Replaced by planEvents.test.js |
| Modify | `server.js` | Swap /todos for /plan-events |
| Modify | `routes/memberData.js` | todosByDate → planEventsByDate |
| Modify | `frontend/components/member/MemberDashboard.tsx` | Replace Todo type, todosByDate → planEventsByDate |
| Modify | `frontend/components/member/pages/CalendarPage.tsx` | Replace todos section with plan events section |
| Modify | `admin.html` | Update all API calls, forms, and render functions |

---

## Task 1: Database Migrations

**Files:**
- Create: `migrations/014_create_plan_events.sql`
- Create: `migrations/015_drop_todos.sql`

- [ ] **Step 1: Write migration 014**

```sql
-- migrations/014_create_plan_events.sql
create table plan_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  title       text not null,
  start_time  text not null,
  end_time    text not null,
  completed   boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on plan_events (user_id, date);
```

- [ ] **Step 2: Write migration 015**

```sql
-- migrations/015_drop_todos.sql
drop table if exists todos;
```

- [ ] **Step 3: Run both migrations in Supabase SQL Editor**

Run `014_create_plan_events.sql` first, then `015_drop_todos.sql`.

Verify with:
```sql
select column_name from information_schema.columns where table_name = 'plan_events';
```
Expected columns: `id`, `user_id`, `date`, `title`, `start_time`, `end_time`, `completed`, `created_by`, `created_at`, `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add migrations/014_create_plan_events.sql migrations/015_drop_todos.sql
git commit -m "feat: add plan_events migration, drop todos"
```

---

## Task 2: Member CRUD Routes + Tests (TDD)

**Files:**
- Create: `routes/planEvents.js`
- Create: `tests/planEvents.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/planEvents.test.js
const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
  next();
});
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/planEvents');

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
    delete:      jest.fn(() => ch),
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

const EVENT = {
  id: 1, title: 'Meeting with AT', start_time: '13:00', end_time: '15:00',
  completed: false, created_by: null, created_at: '2026-05-29T00:00:00Z',
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
    const res = await request(makeApp('member', 'ana@test.com')).get('/?date=29-05-2026');
    expect(res.status).toBe(400);
  });

  test('200 returns events array', async () => {
    supabase.from.mockReturnValueOnce(c([EVENT]));
    const res = await request(makeApp('member', 'ana@test.com')).get('/?date=2026-05-29');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].title).toBe('Meeting with AT');
  });

  test('500 on db error', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'db error' }));
    const res = await request(makeApp('member', 'ana@test.com')).get('/?date=2026-05-29');
    expect(res.status).toBe(500);
  });
});

/* ─── POST / ─── */
describe('POST /', () => {
  test('400 when date missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ title: 'Meeting', start_time: '09:00', end_time: '10:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });

  test('400 when title is blank', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ date: '2026-05-29', title: '   ', start_time: '09:00', end_time: '10:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  test('400 when start_time missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ date: '2026-05-29', title: 'Meeting', end_time: '10:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start_time/i);
  });

  test('400 when end_time missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ date: '2026-05-29', title: 'Meeting', start_time: '09:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_time/i);
  });

  test('400 when end_time not after start_time', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ date: '2026-05-29', title: 'Meeting', start_time: '10:00', end_time: '09:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end_time/i);
  });

  test('201 creates and returns event', async () => {
    supabase.from.mockReturnValueOnce(c(EVENT));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ date: '2026-05-29', title: 'Meeting with AT', start_time: '13:00', end_time: '15:00' });
    expect(res.status).toBe(201);
    expect(res.body.event.title).toBe('Meeting with AT');
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

  test('404 when event not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(404);
  });

  test('403 when member updates another user event', async () => {
    supabase.from.mockReturnValueOnce(c({ user_id: 'other-user' }));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(403);
  });

  test('200 when member updates own event', async () => {
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'user-1' }))
      .mockReturnValueOnce(c({ ...EVENT, completed: true }));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.event.completed).toBe(true);
  });

  test('200 when admin updates any event', async () => {
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'other-user' }))
      .mockReturnValueOnce(c({ ...EVENT, completed: true }));
    const res = await request(makeApp('admin', 'admin@test.com', 'admin-1'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(200);
  });
});

/* ─── DELETE /:id ─── */
describe('DELETE /:id', () => {
  test('404 when event not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com')).delete('/1');
    expect(res.status).toBe(404);
  });

  test('403 when member deletes another user event', async () => {
    supabase.from.mockReturnValueOnce(c({ user_id: 'other-user' }));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1')).delete('/1');
    expect(res.status).toBe(403);
  });

  test('200 when member deletes own event', async () => {
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'user-1' }))
      .mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1')).delete('/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('200 when admin deletes any event', async () => {
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'other-user' }))
      .mockReturnValueOnce(c(null));
    const res = await request(makeApp('admin', 'admin@test.com', 'admin-1')).delete('/1');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with "Cannot find module"**

```bash
npm test -- --testPathPattern=planEvents --no-coverage 2>&1 | tail -5
```
Expected: `Cannot find module '../routes/planEvents'`

- [ ] **Step 3: Write `routes/planEvents.js` — member CRUD only**

```js
// routes/planEvents.js
const router      = require('express').Router();
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  }
  const { data, error } = await supabase
    .from('plan_events')
    .select('id, title, start_time, end_time, completed, created_by, created_at')
    .eq('user_id', req.user.user_id)
    .eq('date', date)
    .order('start_time', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data });
});

router.post('/', async (req, res) => {
  const { date, title, start_time, end_time } = req.body || {};
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required.' });
  if (!start_time || !TIME_RE.test(start_time)) return res.status(400).json({ error: 'start_time must be HH:MM.' });
  if (!end_time || !TIME_RE.test(end_time)) return res.status(400).json({ error: 'end_time must be HH:MM.' });
  if (end_time <= start_time) return res.status(400).json({ error: 'end_time must be after start_time.' });
  const { data, error } = await supabase
    .from('plan_events')
    .insert({ user_id: req.user.user_id, date, title: title.trim(), start_time, end_time })
    .select('id, title, start_time, end_time, completed, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ event: data });
});

router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
  const { title, start_time, end_time, completed } = req.body || {};
  if (title === undefined && start_time === undefined && end_time === undefined && completed === undefined) {
    return res.status(400).json({ error: 'At least one field required.' });
  }
  const { data: existing, error: fetchErr } = await supabase
    .from('plan_events').select('user_id, start_time, end_time').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: 'Event not found.' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  if (!isAdmin && existing.user_id !== req.user.user_id) return res.status(403).json({ error: 'Forbidden.' });
  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (start_time !== undefined) updates.start_time = start_time;
  if (end_time !== undefined) updates.end_time = end_time;
  if (completed !== undefined) updates.completed = Boolean(completed);
  const resolvedStart = updates.start_time ?? existing.start_time;
  const resolvedEnd   = updates.end_time   ?? existing.end_time;
  if (resolvedEnd <= resolvedStart) return res.status(400).json({ error: 'end_time must be after start_time.' });
  const { data, error } = await supabase
    .from('plan_events')
    .update(updates)
    .eq('id', id)
    .select('id, title, start_time, end_time, completed, created_by, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ event: data });
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
  const { data: existing, error: fetchErr } = await supabase
    .from('plan_events').select('user_id').eq('id', id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: 'Event not found.' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';
  if (!isAdmin && existing.user_id !== req.user.user_id) return res.status(403).json({ error: 'Forbidden.' });
  const { error } = await supabase.from('plan_events').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run member CRUD tests — verify they pass**

```bash
npm test -- --testPathPattern=planEvents --no-coverage 2>&1 | tail -10
```
Expected: all member tests pass.

- [ ] **Step 5: Commit**

```bash
git add routes/planEvents.js tests/planEvents.test.js
git commit -m "feat: add planEvents route with member CRUD and tests"
```

---

## Task 3: Admin Routes + Update memberData + Remove Todos

**Files:**
- Modify: `routes/planEvents.js` (append admin routes)
- Modify: `tests/planEvents.test.js` (append admin tests)
- Modify: `routes/memberData.js`
- Delete: `routes/todos.js`
- Delete: `tests/todos.test.js`

- [ ] **Step 1: Append admin tests to `tests/planEvents.test.js`**

Add after the existing DELETE tests:

```js
/* ─── GET /admin ─── */
describe('GET /admin', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/admin?user_id=user-2&date=2026-05-29');
    expect(res.status).toBe(403);
  });

  test('400 when user_id missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin?date=2026-05-29');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user_id/i);
  });

  test('200 returns events for the user', async () => {
    supabase.from.mockReturnValueOnce(c([EVENT]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin?user_id=user-2&date=2026-05-29');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });
});

/* ─── POST /admin ─── */
describe('POST /admin', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/admin').send({ user_id: 'user-2', date: '2026-05-29', title: 'Task', start_time: '09:00', end_time: '10:00' });
    expect(res.status).toBe(403);
  });

  test('400 when user_id missing', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/admin').send({ date: '2026-05-29', title: 'Task', start_time: '09:00', end_time: '10:00' });
    expect(res.status).toBe(400);
  });

  test('201 creates event for a member', async () => {
    supabase.from.mockReturnValueOnce(c({ ...EVENT, created_by: 'admin@test.com' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/admin').send({ user_id: 'user-2', date: '2026-05-29', title: 'Meeting', start_time: '09:00', end_time: '10:00' });
    expect(res.status).toBe(201);
    expect(res.body.event.created_by).toBe('admin@test.com');
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

  test('200 returns members and events', async () => {
    supabase.from
      .mockReturnValueOnce(c([{ id: 'user-1', name: 'Ana', email: 'ana@test.com' }]))
      .mockReturnValueOnce(c([EVENT]));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin/week?week_start=2026-05-25');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.events).toHaveLength(1);
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

  test('200 returns planEventsByDate counts', async () => {
    supabase.from.mockReturnValueOnce(
      c([{ date: '2026-05-05' }, { date: '2026-05-05' }, { date: '2026-05-13' }])
    );
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/admin/month?user_id=user-1&month=5&year=2026');
    expect(res.status).toBe(200);
    expect(res.body.planEventsByDate['2026-05-05']).toBe(2);
    expect(res.body.planEventsByDate['2026-05-13']).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — verify admin tests fail with 404**

```bash
npm test -- --testPathPattern=planEvents --no-coverage 2>&1 | tail -10
```
Expected: member tests pass, admin tests fail with 404.

- [ ] **Step 3: Append admin routes to `routes/planEvents.js` — add before `module.exports`**

```js
router.get('/admin', requireRole('owner', 'admin'), async (req, res) => {
  const { user_id, date } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  const { data, error } = await supabase
    .from('plan_events')
    .select('id, title, start_time, end_time, completed, created_by, created_at')
    .eq('user_id', user_id)
    .eq('date', date)
    .order('start_time', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data });
});

router.post('/admin', requireRole('owner', 'admin'), async (req, res) => {
  const { user_id, date, title, start_time, end_time } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required.' });
  if (!start_time || !TIME_RE.test(start_time)) return res.status(400).json({ error: 'start_time must be HH:MM.' });
  if (!end_time || !TIME_RE.test(end_time)) return res.status(400).json({ error: 'end_time must be HH:MM.' });
  if (end_time <= start_time) return res.status(400).json({ error: 'end_time must be after start_time.' });
  const { data, error } = await supabase
    .from('plan_events')
    .insert({ user_id, date, title: title.trim(), start_time, end_time, created_by: req.user.email })
    .select('id, title, start_time, end_time, completed, created_by, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ event: data });
});

router.get('/admin/week', requireRole('owner', 'admin'), async (req, res) => {
  const { week_start } = req.query;
  if (!week_start || !DATE_RE.test(week_start)) {
    return res.status(400).json({ error: 'week_start must be YYYY-MM-DD.' });
  }
  const end = new Date(week_start);
  end.setDate(end.getDate() + 5);
  const endStr = end.toISOString().slice(0, 10);
  const [{ data: members, error: mErr }, { data: events, error: eErr }] = await Promise.all([
    supabase.from('users').select('id, name, email').eq('status', 'Active').order('name'),
    supabase.from('plan_events')
      .select('id, user_id, date, title, start_time, end_time, completed, created_by')
      .gte('date', week_start)
      .lte('date', endStr)
      .order('start_time', { ascending: true }),
  ]);
  if (mErr) return res.status(500).json({ error: mErr.message });
  if (eErr) return res.status(500).json({ error: eErr.message });
  return res.json({ members: members || [], events: events || [] });
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
    .from('plan_events').select('date')
    .eq('user_id', user_id)
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) return res.status(500).json({ error: error.message });
  const counts = {};
  for (const row of (data || [])) {
    counts[row.date] = (counts[row.date] || 0) + 1;
  }
  return res.json({ planEventsByDate: counts });
});
```

- [ ] **Step 4: Run all planEvents tests — verify all pass**

```bash
npm test -- --testPathPattern=planEvents --no-coverage 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 5: Update `routes/memberData.js`**

Replace the `todos` query and `todosByDate` map. Find these lines:

```js
  supabase.from('todos').select('date').eq('user_id', userId)
    .gte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-01`)
    .lte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-${String(new Date(yearNum, monthNum, 0).getDate()).padStart(2,'0')}`),
```

Replace with:

```js
  supabase.from('plan_events').select('date').eq('user_id', userId)
    .gte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-01`)
    .lte('date', `${yearNum}-${String(monthNum).padStart(2,'0')}-${String(new Date(yearNum, monthNum, 0).getDate()).padStart(2,'0')}`),
```

Also rename the destructured variable from `{ data: monthTodos }` to `{ data: monthPlanEvents }`.

Then replace the map block:

```js
  const todosByDate = {};
  for (const row of (monthTodos || [])) {
    const d = String(row.date).slice(0, 10);
    todosByDate[d] = (todosByDate[d] || 0) + 1;
  }
```

With:

```js
  const planEventsByDate = {};
  for (const row of (monthPlanEvents || [])) {
    const d = String(row.date).slice(0, 10);
    planEventsByDate[d] = (planEventsByDate[d] || 0) + 1;
  }
```

And in `res.json(...)` replace `todosByDate,` with `planEventsByDate,`.

- [ ] **Step 6: Delete the old todos files**

```bash
rm /home/erwindev/Attendance/routes/todos.js
rm /home/erwindev/Attendance/tests/todos.test.js
```

- [ ] **Step 7: Run full test suite — verify all pass**

```bash
npm test --no-coverage 2>&1 | tail -15
```
Expected: all tests pass (todos tests gone, planEvents tests passing, everything else unchanged).

- [ ] **Step 8: Commit**

```bash
git add routes/planEvents.js tests/planEvents.test.js routes/memberData.js
git rm routes/todos.js tests/todos.test.js
git commit -m "feat: add admin planEvents routes, update memberData, remove todos"
```

---

## Task 4: Register Route in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Swap the route in `server.js`**

Find:
```js
app.use('/todos',  require('./routes/todos'));
```

Replace with:
```js
app.use('/plan-events', require('./routes/planEvents'));
```

- [ ] **Step 2: Verify route loads**

```bash
node -e "require('./routes/planEvents'); console.log('planEvents route loads OK')"
```
Expected: `planEvents route loads OK`

- [ ] **Step 3: Run full test suite**

```bash
npm test --no-coverage 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: register plan-events route, remove todos route"
```

---

## Task 5: Frontend Types

**Files:**
- Modify: `frontend/components/member/MemberDashboard.tsx`

- [ ] **Step 1: Replace `Todo` interface with `PlanEvent`**

Find and remove:
```ts
export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  created_by: string | null;
  created_at: string;
}
```

Replace with:
```ts
export interface PlanEvent {
  id: number;
  title: string;
  start_time: string;
  end_time: string;
  completed: boolean;
  created_by: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Replace `todosByDate` with `planEventsByDate` in `MemberData`**

Find:
```ts
  todosByDate?: Record<string, number>;
```

Replace with:
```ts
  planEventsByDate?: Record<string, number>;
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: errors about `Todo` being missing (CalendarPage still references it) — that's fine, Task 6 fixes those.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/member/MemberDashboard.tsx
git commit -m "feat: replace Todo type with PlanEvent, todosByDate → planEventsByDate"
```

---

## Task 6: CalendarPage — Replace Todos with Plan Events

**Files:**
- Modify: `frontend/components/member/pages/CalendarPage.tsx`

This task makes all the changes to CalendarPage in one go: import, state, functions, onClick, dot indicator, legend, and the day panel JSX section.

- [ ] **Step 1: Update the import line**

Find:
```ts
import type { MemberData, CalendarDay, Todo } from '../MemberDashboard';
```

Replace with:
```ts
import type { MemberData, CalendarDay, PlanEvent } from '../MemberDashboard';
```

- [ ] **Step 2: Replace todo state variables**

Find the block:
```ts
  const [todos,       setTodos]       = useState<Todo[]>([]);
  const [todosBusy,   setTodosBusy]   = useState(false);
  const [todoErr,     setTodoErr]     = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addText,     setAddText]     = useState('');
  const [addBusy,     setAddBusy]     = useState(false);
```

Replace with:
```ts
  const [events,      setEvents]      = useState<PlanEvent[]>([]);
  const [eventsBusy,  setEventsBusy]  = useState(false);
  const [eventErr,    setEventErr]    = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle,    setAddTitle]    = useState('');
  const [addStart,    setAddStart]    = useState('09:00');
  const [addEnd,      setAddEnd]      = useState('10:00');
  const [addBusy,     setAddBusy]     = useState(false);
```

- [ ] **Step 3: Update the `navigate` function clear-state line**

Find:
```ts
  setTodos([]); setShowAddForm(false); setTodoErr(null);
```

Replace with:
```ts
  setEvents([]); setShowAddForm(false); setEventErr(null);
```

- [ ] **Step 4: Replace todo API functions**

Find and remove the block starting with `async function fetchTodos` through `async function deleteTodo` (4 functions total). Replace with:

```ts
  async function fetchEvents(isoDate: string) {
    setEventsBusy(true); setEventErr(null); setEvents([]);
    try {
      const r = await clientFetch(`${apiUrl}/plan-events?date=${isoDate}`);
      if (r.ok) setEvents((await r.json()).events ?? []);
      else setEventErr('Could not load plan.');
    } catch { setEventErr('Network error.'); }
    finally  { setEventsBusy(false); }
  }

  async function addEvent(isoDate: string, keepForm: boolean) {
    if (!addTitle.trim()) return;
    setAddBusy(true);
    try {
      const r = await clientFetch(`${apiUrl}/plan-events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: isoDate, title: addTitle.trim(), start_time: addStart, end_time: addEnd }),
      });
      if (r.ok) {
        const { event } = await r.json();
        setEvents(prev => [...prev, event].sort((a, b) => a.start_time.localeCompare(b.start_time)));
        setAddTitle('');
        if (!keepForm) { setShowAddForm(false); setAddStart('09:00'); setAddEnd('10:00'); }
      } else { setEventErr('Could not save event.'); }
    } catch { setEventErr('Network error.'); }
    finally  { setAddBusy(false); }
  }

  async function toggleEvent(id: number, completed: boolean) {
    try {
      const r = await clientFetch(`${apiUrl}/plan-events/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (r.ok) {
        const { event } = await r.json();
        setEvents(prev => prev.map(e => e.id === id ? event : e));
      } else { setEventErr('Could not update event.'); }
    } catch { setEventErr('Network error.'); }
  }

  async function deleteEvent(id: number) {
    try {
      const r = await clientFetch(`${apiUrl}/plan-events/${id}`, { method: 'DELETE' });
      if (r.ok) setEvents(prev => prev.filter(e => e.id !== id));
      else setEventErr('Could not delete event.');
    } catch { setEventErr('Network error.'); }
  }
```

- [ ] **Step 5: Update the cell `onClick` handler**

Find:
```tsx
              if (isSel) {
                    setSelected(null); setTodos([]); setShowAddForm(false); setTodoErr(null);
                  } else {
                    setSelected(cell);
                    fetchTodos(toISO(cell.date));
                    setShowAddForm(false); setTodoErr(null);
```

Replace with:
```tsx
              if (isSel) {
                    setSelected(null); setEvents([]); setShowAddForm(false); setEventErr(null);
                  } else {
                    setSelected(cell);
                    fetchEvents(toISO(cell.date));
                    setShowAddForm(false); setEventErr(null);
```

- [ ] **Step 6: Update the cell dot indicator**

Find:
```tsx
                      {/* Todo dot */}
                      {!cell.isWeekend && (data?.todosByDate?.[toISO(cell.date)] ?? 0) > 0 && (
```

Replace with:
```tsx
                      {/* Plan dot */}
                      {!cell.isWeekend && (data?.planEventsByDate?.[toISO(cell.date)] ?? 0) > 0 && (
```

- [ ] **Step 7: Update the legend entry**

Find:
```tsx
                  Has tasks
```

Replace with:
```tsx
                  Has plans
```

- [ ] **Step 8: Replace the entire todos section JSX with the plan events section**

Find the comment `{/* ── Todos section ── */}` and replace the entire block (from that comment through the closing `</div>` of the section, just before the closing `</div>` of the detail panel) with:

```tsx
              {/* ── Plan events section ── */}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Day plan
                  </span>
                  {!showAddForm && (
                    <button
                      onClick={() => setShowAddForm(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 10px', fontSize: 11.5, fontFamily: F_SANS, color: C.text2, cursor: 'pointer' }}
                    >
                      + Add event
                    </button>
                  )}
                </div>

                {eventErr && <p style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{eventErr}</p>}
                {eventsBusy && <p style={{ fontSize: 12, color: C.text3 }}>Loading…</p>}

                {!eventsBusy && events.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {events.map(ev => (
                      <div
                        key={ev.id}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 11px', borderRadius: 9, background: C.surface2, border: `1px solid ${C.border}`, opacity: ev.completed ? 0.55 : 1 }}
                      >
                        <button
                          onClick={() => toggleEvent(ev.id, !ev.completed)}
                          style={{ width: 16, height: 16, borderRadius: 4, border: ev.completed ? 'none' : `1.5px solid ${C.borderStrong}`, background: ev.completed ? C.green : 'transparent', color: '#fff', fontSize: 10, flexShrink: 0, marginTop: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {ev.completed ? '✓' : ''}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: '#7c3aed', letterSpacing: '0.03em', marginBottom: 2 }}>
                            {ev.start_time} – {ev.end_time}
                          </div>
                          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.3, textDecoration: ev.completed ? 'line-through' : 'none' }}>
                            {ev.title}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteEvent(ev.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.text3, padding: '0 2px', lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!eventsBusy && events.length === 0 && !showAddForm && (
                  <p style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>No plan events for this day.</p>
                )}

                {showAddForm && (
                  <div style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 10, padding: '14px', marginTop: 6 }}>
                    <div style={{ fontFamily: F_MONO, fontSize: 10, color: '#7c3aed', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                      New plan event
                    </div>
                    <input
                      autoFocus
                      value={addTitle}
                      onChange={e => setAddTitle(e.target.value)}
                      placeholder="What are you doing? (e.g. Meeting with AT)"
                      style={{ width: '100%', padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, background: C.surface, color: C.text, outline: 'none', marginBottom: 8, boxSizing: 'border-box' as const }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.06em', flexShrink: 0 }}>FROM</span>
                      <input
                        type="time"
                        value={addStart}
                        onChange={e => setAddStart(e.target.value)}
                        style={{ padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_MONO, background: C.surface, color: C.text }}
                      />
                      <span style={{ color: C.text3, fontSize: 12 }}>→</span>
                      <span style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.06em', flexShrink: 0 }}>TO</span>
                      <input
                        type="time"
                        value={addEnd}
                        onChange={e => setAddEnd(e.target.value)}
                        style={{ padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_MONO, background: C.surface, color: C.text }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => addEvent(toISO(selected!.date), false)}
                        disabled={addBusy || !addTitle.trim()}
                        style={{ padding: '7px 12px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}
                      >
                        {addBusy ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => addEvent(toISO(selected!.date), true)}
                        disabled={addBusy || !addTitle.trim()}
                        style={{ padding: '7px 12px', background: 'rgba(124,58,237,0.08)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, fontSize: 12, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}
                      >
                        Save + add another
                      </button>
                      <button
                        onClick={() => { setShowAddForm(false); setAddTitle(''); setAddStart('09:00'); setAddEnd('10:00'); }}
                        style={{ padding: '7px 10px', background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: F_SANS, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
```

- [ ] **Step 9: Run TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 10: Build the frontend**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
git add frontend/components/member/pages/CalendarPage.tsx
git commit -m "feat: replace todos section with plan events in CalendarPage"
```

---

## Task 7: Update admin.html

**Files:**
- Modify: `admin.html`

This task updates all API calls from `/todos/*` to `/plan-events/*`, updates the assign form to include time pickers, updates `renderDayTasks` to show time ranges, and updates the week grid pills.

- [ ] **Step 1: Update `loadTasksDots` — API URL and response key**

Find:
```js
    const res = await apiFetch(`${API_BASE}/todos/admin/month?user_id=${_tasksUserId}&month=${_tasksMonth}&year=${_tasksYear}`);
    if (res.ok) {
      const { todosByDate } = await res.json();
      _tasksDots = todosByDate || {};
    } else {
      _tasksDots = {};
    }
```

Replace with:
```js
    const res = await apiFetch(`${API_BASE}/plan-events/admin/month?user_id=${_tasksUserId}&month=${_tasksMonth}&year=${_tasksYear}`);
    if (res.ok) {
      const { planEventsByDate } = await res.json();
      _tasksDots = planEventsByDate || {};
    } else {
      _tasksDots = {};
    }
```

- [ ] **Step 2: Update `loadDayTasks` — API URL and response key**

Find:
```js
    const res = await apiFetch(`${API_BASE}/todos/admin?user_id=${_tasksUserId}&date=${_tasksSelDate}`);
    const data = await res.json();
    if (!res.ok) { listEl.innerHTML = `<p style="font-size:12px;color:var(--red)">${escapeHtml(data.error || 'Error loading tasks.')}</p>`; return; }
    renderDayTasks(data.todos || []);
```

Replace with:
```js
    const res = await apiFetch(`${API_BASE}/plan-events/admin?user_id=${_tasksUserId}&date=${_tasksSelDate}`);
    const data = await res.json();
    if (!res.ok) { listEl.innerHTML = `<p style="font-size:12px;color:var(--red)">${escapeHtml(data.error || 'Error loading events.')}</p>`; return; }
    renderDayTasks(data.events || []);
```

- [ ] **Step 3: Update `renderDayTasks` to show time ranges**

Find:
```js
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
```

Replace with:
```js
function renderDayTasks(events) {
  const listEl = document.getElementById('tasks-day-list');
  if (!events.length) { listEl.innerHTML = '<p style="font-size:12px;color:var(--text3)">No plan events for this day.</p>'; return; }
  listEl.innerHTML = events.map(t => `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border-radius:9px;background:#fafaf8;border:1px solid var(--border);opacity:${t.completed ? 0.55 : 1}">
      <button onclick="adminToggleTodo(${t.id}, ${!t.completed})" style="width:16px;height:16px;border-radius:4px;border:${t.completed ? 'none' : '1.5px solid #ccc'};background:${t.completed ? 'var(--accent)' : 'transparent'};color:white;font-size:10px;flex-shrink:0;margin-top:2px;cursor:pointer">${t.completed ? '✓' : ''}</button>
      <div style="flex:1;min-width:0">
        <div style="font-family:'Instrument Mono',monospace;font-size:10.5px;color:#6d28d9;letter-spacing:0.03em;margin-bottom:2px">${escapeHtml(t.start_time)} – ${escapeHtml(t.end_time)}</div>
        <div style="font-size:13px;color:var(--text);line-height:1.3;text-decoration:${t.completed ? 'line-through' : 'none'}">${escapeHtml(t.title)}${t.created_by ? `<span style="font-size:10px;color:var(--text3);margin-left:6px">(by ${escapeHtml(t.created_by)})</span>` : ''}</div>
      </div>
      <button onclick="adminDeleteTodo(${t.id})" style="background:none;border:none;cursor:pointer;font-size:13px;color:#ccc;padding:0 2px">×</button>
    </div>
  `).join('');
}
```

- [ ] **Step 4: Update `adminToggleTodo` and `adminDeleteTodo` — API URLs**

Find:
```js
    const res = await apiFetch(`${API_BASE}/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) });
```
Replace with:
```js
    const res = await apiFetch(`${API_BASE}/plan-events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) });
```

Find:
```js
    const res = await apiFetch(`${API_BASE}/todos/${id}`, { method: 'DELETE' });
```
Replace with:
```js
    const res = await apiFetch(`${API_BASE}/plan-events/${id}`, { method: 'DELETE' });
```

- [ ] **Step 5: Update the assign form HTML — add time inputs**

Find the assign form in the modal HTML:
```html
          <div style="display:flex;gap:6px">
            <input id="tasks-assign-input" style="flex:1;padding:7px 10px;font-size:13px;border:1px solid var(--border);border-radius:8px;font-family:inherit" placeholder="Task description…">
            <button class="btn btn-primary" style="font-size:12px" onclick="submitAssignTask()">Save</button>
            <button class="btn" style="font-size:12px" onclick="closeAssignTaskForm()">Cancel</button>
          </div>
          <p id="tasks-assign-error" style="color:var(--red);font-size:12px;margin-top:4px"></p>
```

Replace with:
```html
          <div style="display:flex;gap:6px;margin-bottom:8px">
            <input id="tasks-assign-input" style="flex:1;padding:7px 10px;font-size:13px;border:1px solid var(--border);border-radius:8px;font-family:inherit" placeholder="What are you doing? (e.g. Meeting with AT)">
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:10px;color:var(--text3);font-weight:600;width:36px;flex-shrink:0">FROM</span>
            <input id="tasks-assign-start" type="time" value="09:00" style="padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit">
            <span style="color:var(--text3)">→</span>
            <span style="font-size:10px;color:var(--text3);font-weight:600;width:20px;flex-shrink:0">TO</span>
            <input id="tasks-assign-end" type="time" value="10:00" style="padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit">
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary" style="font-size:12px" onclick="submitAssignTask()">Save</button>
            <button class="btn" style="font-size:12px" onclick="closeAssignTaskForm()">Cancel</button>
          </div>
          <p id="tasks-assign-error" style="color:var(--red);font-size:12px;margin-top:4px"></p>
```

- [ ] **Step 6: Update `submitAssignTask` — use new fields and API URL**

Find:
```js
    const res = await apiFetch(`${API_BASE}/todos/admin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: _tasksUserId, date: _tasksSelDate, text }),
    });
```

Replace with:
```js
    const start_time = document.getElementById('tasks-assign-start').value;
    const end_time   = document.getElementById('tasks-assign-end').value;
    if (!start_time || !end_time) { errEl.textContent = 'Start and end time are required.'; return; }
    if (end_time <= start_time)   { errEl.textContent = 'End time must be after start time.'; return; }
    const res = await apiFetch(`${API_BASE}/plan-events/admin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: _tasksUserId, date: _tasksSelDate, title: text, start_time, end_time }),
    });
```

Also in `submitAssignTask`, rename the variable `text` to clarify it's the title. Find:
```js
  const text  = document.getElementById('tasks-assign-input').value.trim();
  const errEl = document.getElementById('tasks-assign-error');
  errEl.textContent = '';
  if (!text) { errEl.textContent = 'Task text is required.'; return; }
```

Replace with:
```js
  const text  = document.getElementById('tasks-assign-input').value.trim();
  const errEl = document.getElementById('tasks-assign-error');
  errEl.textContent = '';
  if (!text) { errEl.textContent = 'Event title is required.'; return; }
```

- [ ] **Step 7: Update `fetchTeamTasks` — API URL and response key**

Find:
```js
    const res = await apiFetch(`${API_BASE}/todos/admin/week?week_start=${_weekStart}`);
    const data = await res.json();
    if (!res.ok) { gridEl.innerHTML = `<p style="padding:16px;color:var(--red)">${escapeHtml(data.error || 'Error loading.')}</p>`; return; }
    renderWeekGrid(data.members || [], data.todos || [], days, todayISO);
```

Replace with:
```js
    const res = await apiFetch(`${API_BASE}/plan-events/admin/week?week_start=${_weekStart}`);
    const data = await res.json();
    if (!res.ok) { gridEl.innerHTML = `<p style="padding:16px;color:var(--red)">${escapeHtml(data.error || 'Error loading.')}</p>`; return; }
    renderWeekGrid(data.members || [], data.events || [], days, todayISO);
```

- [ ] **Step 8: Update `renderWeekGrid` — variable name and pill display**

Find:
```js
function renderWeekGrid(members, todos, days, todayISO) {
```
Replace with:
```js
function renderWeekGrid(members, events, days, todayISO) {
```

Find:
```js
      const dayTodos = todos.filter(t => t.user_id === m.id && String(t.date).slice(0, 10) === iso);
      const pills = dayTodos.map(t =>
        `<div class="wg-todo-pill ${t.completed ? 'done' : ''}" title="${escapeHtml(t.text)}" onclick="openMemberTasksModal('${m.id}', ${JSON.stringify(m.name)})">
          <span class="pip"></span><span class="wg-pill-text">${escapeHtml(t.text)}</span>
        </div>`
      ).join('');
```

Replace with:
```js
      const dayEvents = events.filter(e => e.user_id === m.id && String(e.date).slice(0, 10) === iso);
      const pills = dayEvents.map(e =>
        `<div class="wg-todo-pill ${e.completed ? 'done' : ''}" title="${escapeHtml(e.title)}" onclick="openMemberTasksModal('${m.id}', ${JSON.stringify(m.name)})">
          <span class="pip"></span><span class="wg-pill-text">${escapeHtml(e.start_time)} ${escapeHtml(e.title)}</span>
        </div>`
      ).join('');
```

- [ ] **Step 9: Run full backend test suite**

```bash
cd /home/erwindev/Attendance && npm test --no-coverage 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 10: Build the frontend**

```bash
cd /home/erwindev/Attendance/frontend && npm run build 2>&1 | tail -10
```
Expected: build succeeds.

- [ ] **Step 11: Commit and push**

```bash
cd /home/erwindev/Attendance
git add admin.html
git commit -m "feat: update admin panel — plan-events API, time pickers, time display in pills"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ `plan_events` table with all columns → Task 1
- ✅ `todos` table dropped → Task 1
- ✅ Member CRUD (GET/POST/PATCH/DELETE) with time validation → Task 2
- ✅ Admin endpoints (GET/POST/week/month) → Task 3
- ✅ `memberData.js` uses `planEventsByDate` → Task 3
- ✅ `server.js` updated → Task 4
- ✅ `Todo` → `PlanEvent` type + `todosByDate` → `planEventsByDate` → Task 5
- ✅ CalendarPage: state, functions, dots, legend, JSX all replaced → Task 6
- ✅ Admin: all API calls updated, time inputs in assign form, time in pills → Task 7
- ✅ `routes/todos.js` and `tests/todos.test.js` deleted → Task 3

**Placeholder scan:** No TBDs. All steps have exact code. ✓

**Type consistency:**
- `PlanEvent` defined in Task 5, used in Task 6. ✓
- `events` (not `todos`) used consistently in routes, tests, admin.html after Task 3. ✓
- `planEventsByDate` used in memberData.js (Task 3), MemberData type (Task 5), CalendarPage (Task 6). ✓
- `addTitle`/`addStart`/`addEnd` state defined in Task 6 Step 2, used in JSX Task 6 Step 8. ✓
- `/plan-events` URL used consistently across Tasks 4, 6, 7. ✓
