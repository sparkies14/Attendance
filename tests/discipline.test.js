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
