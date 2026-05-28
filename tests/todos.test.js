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
