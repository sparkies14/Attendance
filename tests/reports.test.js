const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
  next();
});
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/reports');

function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:        (resolve) => resolve(result),
    catch:       () => Promise.resolve(result),
    select:      jest.fn(() => ch),
    eq:          jest.fn(() => ch),
    neq:         jest.fn(() => ch),
    gte:         jest.fn(() => ch),
    lte:         jest.fn(() => ch),
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

const MEMBER = {
  id: 'user-1',
  email: 'ana@test.com',
  name: 'Ana Reyes',
  country: 'PH',
  created_at: '2020-01-01T00:00:00Z',
};

const ATT_ROW = {
  email: 'ana@test.com',
  date: '2026-05-10',
  late_status: 'MINOR TARDY',
};

const LEAVE_ROW = {
  email: 'ana@test.com',
  status: 'Approved',
  created_at: '2026-05-15T00:00:00Z',
};

const DISC_REC = {
  user_id: 'user-1',
  voided: false,
  issued_at: '2026-05-10T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

/* ─── GET /tardy ─── */
describe('GET /tardy', () => {
  test('403 for member role', async () => {
    const res = await request(makeApp('member', 'ana@test.com')).get('/tardy');
    expect(res.status).toBe(403);
  });

  test('400 when from is malformed', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=not-a-date&to=2026-05-27');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('400 when to is malformed', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });
});
