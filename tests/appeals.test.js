const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
  next();
});
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/appeals');

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

function makeApp(role, email, userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email, role, user_id: userId }; next(); });
  app.use('/', router);
  return app;
}

const APPEAL = {
  id: 1,
  user_id: 'user-1',
  target_type: 'discipline',
  target_id: '1',
  reason: 'I was not warned verbally first.',
  status: 'Pending',
  resolution_note: null,
  resolved_by: null,
  resolved_at: null,
  created_at: '2026-05-27T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

/* ─── POST / ─── */
describe('POST /', () => {
  test('400 when target_type is invalid', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'unknown', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target_type/i);
  });

  test('400 when target_id is missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', reason: 'reason' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target_id/i);
  });

  test('400 when attendance target_id is not YYYY-MM-DD', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'attendance', target_id: 'not-a-date', reason: 'reason' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/i);
  });

  test('400 when reason is missing', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'attendance', target_id: '2026-05-27' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  test('400 when reason is empty string', async () => {
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'attendance', target_id: '2026-05-27', reason: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  test('404 when discipline record not found or not owned by member', async () => {
    supabase.from.mockReturnValueOnce(c(null)); // discipline_records lookup returns nothing
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '99', reason: 'reason' });
    expect(res.status).toBe(404);
  });

  test('404 when leave record not found or not owned by member', async () => {
    supabase.from.mockReturnValueOnce(c(null)); // leave_log lookup returns nothing
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'leave', target_id: '99', reason: 'reason' });
    expect(res.status).toBe(404);
  });

  test('409 when appeal already exists for this record', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1 }));  // discipline_records — record found
    supabase.from.mockReturnValueOnce(c({ id: 5 }));  // appeals duplicate check — already exists
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('201 on success — discipline appeal', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1 }));  // discipline_records — found
    supabase.from.mockReturnValueOnce(c(null));        // appeals duplicate check — none
    supabase.from.mockReturnValueOnce(c(APPEAL));      // insert
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '1', reason: 'I was not warned verbally first.' });
    expect(res.status).toBe(201);
    expect(res.body.appeal.target_type).toBe('discipline');
    expect(res.body.appeal.status).toBe('Pending');
    expect(res.body.appeal.resolution_note).toBeNull();
  });

  test('201 on success — attendance appeal (no record lookup)', async () => {
    supabase.from.mockReturnValueOnce(c(null));   // duplicate check — none
    supabase.from.mockReturnValueOnce(c({ ...APPEAL, target_type: 'attendance', target_id: '2026-05-27' })); // insert
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'attendance', target_id: '2026-05-27', reason: 'I was present that day.' });
    expect(res.status).toBe(201);
    expect(res.body.appeal.target_type).toBe('attendance');
  });

  test('500 when DB error on insert', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1 }));             // discipline_records — found
    supabase.from.mockReturnValueOnce(c(null));                   // duplicate check — none
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' })); // insert fails
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });

  test('500 when DB error on discipline_records lookup', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });

  test('500 when DB error on leave_log lookup', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'leave', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });

  test('500 when DB error on duplicate check', async () => {
    supabase.from.mockReturnValueOnce(c({ id: 1 }));                        // discipline_records — found
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));    // dup check fails
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'discipline', target_id: '1', reason: 'reason' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });

  test('201 on success — leave appeal', async () => {
    const LEAVE_APPEAL = { ...APPEAL, target_type: 'leave', target_id: '5' };
    supabase.from.mockReturnValueOnce(c({ id: 5 }));       // leave_log — found
    supabase.from.mockReturnValueOnce(c(null));             // duplicate check — none
    supabase.from.mockReturnValueOnce(c(LEAVE_APPEAL));    // insert
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/').send({ target_type: 'leave', target_id: '5', reason: 'Leave was wrongly rejected.' });
    expect(res.status).toBe(201);
    expect(res.body.appeal.target_type).toBe('leave');
    expect(res.body.appeal.status).toBe('Pending');
  });
});

/* ─── GET / ─── */
describe('GET /', () => {
  test('200 — returns own appeals sorted newest first', async () => {
    const OLDER = { ...APPEAL, id: 2, created_at: '2026-05-26T00:00:00Z' };
    const NEWER = { ...APPEAL, id: 3, created_at: '2026-05-27T12:00:00Z' };
    supabase.from.mockReturnValueOnce(c([NEWER, OLDER]));
    const res = await request(makeApp('member', 'ana@test.com')).get('/');
    expect(res.status).toBe(200);
    expect(res.body.appeals).toHaveLength(2);
    expect(res.body.appeals[0].id).toBe(3);
    expect(res.body.appeals[1].id).toBe(2);
  });

  test('200 — returns empty array when member has no appeals', async () => {
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('member', 'ana@test.com')).get('/');
    expect(res.status).toBe(200);
    expect(res.body.appeals).toHaveLength(0);
  });

  test('500 when DB error', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('member', 'ana@test.com')).get('/');
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

  test('200 — returns all appeals with member info, Pending first', async () => {
    const RESOLVED = { ...APPEAL, id: 2, status: 'Approved', resolved_at: '2026-05-27T01:00:00Z' };
    supabase.from.mockReturnValueOnce(c([RESOLVED, APPEAL])); // appeals (resolved first in raw data)
    supabase.from.mockReturnValueOnce(c([                     // users
      { id: 'user-1', email: 'ana@test.com', name: 'Ana Reyes' },
    ]));
    const res = await request(makeApp('admin', 'admin@test.com')).get('/all');
    expect(res.status).toBe(200);
    expect(res.body.appeals).toHaveLength(2);
    // Pending appeal should be first after sort
    expect(res.body.appeals[0].status).toBe('Pending');
    expect(res.body.appeals[0].email).toBe('ana@test.com');
    expect(res.body.appeals[0].name).toBe('Ana Reyes');
    expect(res.body.appeals[1].status).toBe('Approved');
  });

  test('500 when DB error on appeals query', async () => {
    supabase.from.mockReturnValueOnce(c(null, { message: 'DB error' }));
    const res = await request(makeApp('admin', 'admin@test.com')).get('/all');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});
