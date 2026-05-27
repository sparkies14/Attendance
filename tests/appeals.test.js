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
});
