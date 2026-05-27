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

  test('500 when DB error on insert', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 'user-1' }));           // user lookup succeeds
    supabase.from.mockReturnValueOnce(c(null, { message: 'Insert failed' })); // insert fails
    const res = await request(makeApp('admin', 'admin@test.com'))
      .post('/').send({ email: 'ana@test.com', reason: '5 tardies' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Insert failed');
  });
});

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
