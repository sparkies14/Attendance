process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));
jest.mock('../lib/discord', () => ({ sendMessage: jest.fn().mockResolvedValue(undefined), CHANNELS: {} }));

const supabase = require('../lib/supabase');
const router = require('../routes/attendance');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/webhook/attendance', router);
  return app;
}
const token = () => signToken({ user_id: 'u1', email: 'm@x.com', role: 'member' });

// Generic chainable builder; terminal ops resolve `result`.
function builder(result) {
  const b = {};
  ['select','insert','update','delete','eq','order','gte','lte','in'].forEach(m => b[m] = jest.fn(() => b));
  b.maybeSingle = jest.fn(() => Promise.resolve(result));
  b.then = (r) => r(result);
  return b;
}

const ACTIVE_USER = { name: 'Maria Cruz', job_role: 'member', status: 'Active' };

beforeEach(() => { jest.clearAllMocks(); });

describe('break-out / break-in (multi-session, secs)', () => {
  test('break-out inserts a new open break_log row', async () => {
    const insertBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      return insertBuilder; // break_log
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'break-out', local_time: '10:00:00', date: '2026-06-02' });
    expect(res.status).toBe(200);
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Maria Cruz', date: '2026-06-02', break_out: '10:00:00', break_in: '', duration_secs: 0,
    }));
  });

  test('break-in closes the open row with duration_secs', async () => {
    const updateBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      // break_log: select open row → return one open row; update → capture
      const b = builder({ data: [{ id: 7, break_out: '10:00:00', break_in: '' }] });
      b.update = updateBuilder.update;
      return b;
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'break-in', local_time: '10:03:30', date: '2026-06-02' });
    expect(res.status).toBe(200);
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      break_in: '10:03:30', duration_secs: 210,
    }));
  });

  test('break-in with no open row → 400', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      return builder({ data: [] });
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'break-in', local_time: '10:03:30', date: '2026-06-02' });
    expect(res.status).toBe(400);
  });
});
