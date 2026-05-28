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
    supabase.from.mockReturnValueOnce(c({ user_id: 'other-user', start_time: '09:00', end_time: '10:00' }));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(403);
  });

  test('200 when member updates own event', async () => {
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'user-1', start_time: '09:00', end_time: '10:00' }))
      .mockReturnValueOnce(c({ ...EVENT, completed: true }));
    const res = await request(makeApp('member', 'ana@test.com', 'user-1'))
      .patch('/1').send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.event.completed).toBe(true);
  });

  test('200 when admin updates any event', async () => {
    supabase.from
      .mockReturnValueOnce(c({ user_id: 'other-user', start_time: '09:00', end_time: '10:00' }))
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
