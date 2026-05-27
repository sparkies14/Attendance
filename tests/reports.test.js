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

  it('400 when from is after to', async () => {
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-12-31&to=2026-01-01');
    expect(res.status).toBe(400);
  });

  test('200 — returns per-member counts and country rollup', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));    // users
    supabase.from.mockReturnValueOnce(c([ATT_ROW]));   // attendance
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2026-05-01');
    expect(res.body.to).toBe('2026-05-27');
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].email).toBe('ana@test.com');
    expect(res.body.members[0].minor).toBe(1);
    expect(res.body.members[0].total).toBe(1);
    expect(res.body.byCountry).toHaveLength(1);
    expect(res.body.byCountry[0].country).toBe('PH');
    expect(res.body.byCountry[0].minor).toBe(1);
    expect(res.body.byCountry[0].total).toBe(1);
  });

  test('200 — empty members when no active users', async () => {
    supabase.from.mockReturnValueOnce(c([]));  // users
    supabase.from.mockReturnValueOnce(c([]));  // attendance
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(0);
    expect(res.body.byCountry).toHaveLength(0);
  });

  test('500 when DB error on users query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });

  it('200 — counts all four tardy types correctly', async () => {
    const rows = [
      { email: 'ana@test.com', date: '2026-05-05', late_status: 'MINOR TARDY' },
      { email: 'ana@test.com', date: '2026-05-06', late_status: 'MAJOR TARDY' },
      { email: 'ana@test.com', date: '2026-05-07', late_status: 'AWOL HALF DAY' },
      { email: 'ana@test.com', date: '2026-05-08', late_status: 'AWOL FULL DAY' },
    ];
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c(rows));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-31');
    expect(res.status).toBe(200);
    const m = res.body.members[0];
    expect(m.minor).toBe(1);
    expect(m.major).toBe(1);
    expect(m.awolHalf).toBe(1);
    expect(m.awolFull).toBe(1);
    expect(m.total).toBe(4);
  });

  test('500 when DB error on attendance query', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .get('/tardy?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});

/* ─── GET /leave ─── */
describe('GET /leave', () => {
  const app = makeApp('admin', 'admin@test.com');
  const memberApp = makeApp('member', 'ana@test.com');

  test('403 for member role', async () => {
    const res = await request(memberApp).get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(403);
  });

  test('400 when date range is invalid', async () => {
    const res = await request(app).get('/leave?from=bad&to=2026-05-27');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('200 — returns balance fields and usedInRange', async () => {
    // users, leave_log, leave_adjustments
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([LEAVE_ROW]));   // 1 approved leave in range
    supabase.from.mockReturnValueOnce(c([]));            // no adjustments
    const res = await request(app).get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2026-05-01');
    expect(res.body.to).toBe('2026-05-27');
    expect(res.body.members).toHaveLength(1);
    const m = res.body.members[0];
    expect(m.email).toBe('ana@test.com');
    expect(m.used).toBe(1);
    expect(m.usedInRange).toBe(1);
    expect(typeof m.entitled).toBe('number');
    expect(typeof m.remaining).toBe('number');
  });

  test('200 — usedInRange is 0 when leave is outside range', async () => {
    const oldLeave = { email: 'ana@test.com', status: 'Approved', created_at: '2026-03-01T00:00:00Z' };
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([oldLeave]));
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(app).get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    const m = res.body.members[0];
    expect(m.used).toBe(1);       // full-year used = 1
    expect(m.usedInRange).toBe(0); // not in May range
  });

  test('500 when DB error on users query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB fail' }));
    const res = await request(app).get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB fail');
  });

  test('500 when DB error on leave_log query', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c(null, { message: 'leave DB fail' }));
    const res = await request(app).get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('leave DB fail');
  });

  test('500 when DB error on adjustments query', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([LEAVE_ROW]));
    supabase.from.mockReturnValueOnce(c(null, { message: 'adj DB fail' }));
    const res = await request(app).get('/leave?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('adj DB fail');
  });
});

/* ─── GET /discipline ─── */
describe('GET /discipline', () => {
  const app = makeApp('admin', 'admin@test.com');
  const memberApp = makeApp('member', 'ana@test.com');

  test('403 for member role', async () => {
    const res = await request(memberApp).get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(403);
  });

  test('400 when date range is invalid', async () => {
    const res = await request(app).get('/discipline?from=bad&to=2026-05-27');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('200 — returns warning counts and issuedInRange', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([DISC_REC]));
    const res = await request(app).get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2026-05-01');
    expect(res.body.to).toBe('2026-05-27');
    expect(res.body.members).toHaveLength(1);
    const m = res.body.members[0];
    expect(m.email).toBe('ana@test.com');
    expect(m.total).toBe(1);
    expect(m.active).toBe(1);
    expect(m.voided).toBe(0);
    expect(m.issuedInRange).toBe(1);
  });

  test('200 — distinguishes active vs voided', async () => {
    const activeRec  = { user_id: 'user-1', voided: false, issued_at: '2026-05-10T00:00:00Z' };
    const voidedRec  = { user_id: 'user-1', voided: true,  issued_at: '2026-04-01T00:00:00Z' };
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c([activeRec, voidedRec]));
    const res = await request(app).get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(200);
    const m = res.body.members[0];
    expect(m.total).toBe(2);
    expect(m.active).toBe(1);
    expect(m.voided).toBe(1);
    expect(m.issuedInRange).toBe(1); // only the May one
  });

  test('500 when DB error on users query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB fail' }));
    const res = await request(app).get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB fail');
  });

  test('500 when DB error on discipline_records query', async () => {
    supabase.from.mockReturnValueOnce(c([MEMBER]));
    supabase.from.mockReturnValueOnce(c(null, { message: 'disc DB fail' }));
    const res = await request(app).get('/discipline?from=2026-05-01&to=2026-05-27');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('disc DB fail');
  });
});
