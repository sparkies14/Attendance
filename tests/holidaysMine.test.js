process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router = require('../routes/holidays');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/holidays', router);
  return app;
}
const memberToken = () => signToken({ user_id: 'u1', email: 'm@x.com', role: 'member' });

function userChain(user) {
  const ch = { select: jest.fn(() => ch), eq: jest.fn(() => ch), maybeSingle: jest.fn(() => Promise.resolve({ data: user, error: null })) };
  return ch;
}
function holidayChain(rows) {
  const ch = { select: jest.fn(() => ch), eq: jest.fn(() => ch), gte: jest.fn(() => ch), lte: jest.fn(() => ch), order: jest.fn(() => ch), then: (r) => r({ data: rows, error: null }) };
  return ch;
}
beforeEach(() => { jest.clearAllMocks(); });

describe('GET /holidays/mine', () => {
  test('returns the logged-in user country holidays', async () => {
    supabase.from.mockImplementation((t) => t === 'users'
      ? userChain({ country: 'PH' })
      : holidayChain([{ id: 'h1', date: '2026-06-12', name: 'Independence Day', country: 'PH', source: 'auto' }]));
    const res = await request(makeApp())
      .get('/holidays/mine?year=2026')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.country).toBe('PH');
    expect(res.body.holidays).toHaveLength(1);
  });
  test('user with no country returns empty list', async () => {
    supabase.from.mockImplementation((t) => t === 'users' ? userChain({ country: null }) : holidayChain([]));
    const res = await request(makeApp())
      .get('/holidays/mine?year=2026')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.country).toBeNull();
    expect(res.body.holidays).toEqual([]);
  });
  test('401 when unauthenticated', async () => {
    const res = await request(makeApp()).get('/holidays/mine?year=2026');
    expect(res.status).toBe(401);
  });
});
