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
