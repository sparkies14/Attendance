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
