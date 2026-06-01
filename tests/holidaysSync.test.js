process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router = require('../routes/adminHolidays');

function chain(result) {
  const ch = {};
  ['select','insert','upsert','delete','eq','gte','lte','order','in','update'].forEach(m => { ch[m] = jest.fn(() => ch); });
  ch.then = (resolve) => resolve(result);
  ch.single = jest.fn(() => Promise.resolve(result));
  return ch;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/admin', router);
  return app;
}

const ownerToken = () => signToken({ user_id: 'u1', email: 'owner@x.com', role: 'owner' });

beforeEach(() => { jest.clearAllMocks(); delete process.env.CALENDARIFIC_API_KEY; global.fetch = jest.fn(); });

describe('GET /admin/holidays (route prefix)', () => {
  test('returns the holidays list at the /admin/holidays path', async () => {
    supabase.from.mockReturnValue(chain({ data: [{ id: 'h1', date: '2026-01-01', name: "New Year", country: 'PH', source: 'manual' }], error: null }));
    const res = await request(makeApp())
      .get('/admin/holidays')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.holidays).toHaveLength(1);
  });
});

describe('POST /admin/holidays/sync', () => {
  test('400 when API key not configured', async () => {
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ country: 'PH', year: 2026 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/API key/i);
  });
  test('400 for unsupported country', async () => {
    process.env.CALENDARIFIC_API_KEY = 'key';
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ country: 'US', year: 2026 });
    expect(res.status).toBe(400);
  });
  test('imports national holidays: deletes old auto rows then inserts', async () => {
    process.env.CALENDARIFIC_API_KEY = 'key';
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ meta: { code: 200 }, response: { holidays: [
        { name: "New Year's Day", date: { iso: '2026-01-01' }, type: ['National holiday'] },
        { name: 'Independence Day', date: { iso: '2026-06-12' }, type: ['National holiday'] },
      ] } }),
    }));
    supabase.from.mockReturnValue(chain({ error: null }));
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ country: 'PH', year: 2026 });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
  });
  test('502 on provider error', async () => {
    process.env.CALENDARIFIC_API_KEY = 'key';
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ meta: { code: 401, error_detail: 'Invalid API key' } }) }));
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ country: 'PH', year: 2026 });
    expect(res.status).toBe(502);
  });
  test('403 for non-owner', async () => {
    process.env.CALENDARIFIC_API_KEY = 'key';
    const adminToken = signToken({ user_id: 'u9', email: 'a@x.com', role: 'admin' });
    const res = await request(makeApp())
      .post('/admin/holidays/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ country: 'PH', year: 2026 });
    expect(res.status).toBe(403);
  });
});
