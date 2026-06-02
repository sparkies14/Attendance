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

  test('break-out blocked once the 15-min daily budget is spent', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      // Completed breaks summing to the full 900s budget, none open.
      return builder({ data: [{ break_in: '10:15:00', duration_secs: 900 }] });
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'break-out', local_time: '11:00:00', date: '2026-06-02' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no break time remaining/i);
  });
});

describe('lunch-out / lunch-in (single-use, secs)', () => {
  test('lunch-out inserts when no lunch yet', async () => {
    const insertBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      const b = builder({ data: [] }); // no existing lunch rows
      b.insert = insertBuilder.insert;
      return b;
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'lunch-out', local_time: '12:00:00', date: '2026-06-02' });
    expect(res.status).toBe(200);
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Maria Cruz', date: '2026-06-02', lunch_out: '12:00:00', lunch_in: '', duration_secs: 0,
    }));
  });

  test('lunch-out rejected when lunch already consumed', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      return builder({ data: [{ id: 1, lunch_out: '12:00:00', lunch_in: '12:55:00' }] });
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'lunch-out', local_time: '14:00:00', date: '2026-06-02' });
    expect(res.status).toBe(400);
  });

  test('lunch-in closes open lunch with duration_secs', async () => {
    const updateBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      const b = builder({ data: [{ id: 5, lunch_out: '12:00:00', lunch_in: '' }] });
      b.update = updateBuilder.update;
      return b;
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'lunch-in', local_time: '12:55:10', date: '2026-06-02' });
    expect(res.status).toBe(200);
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      lunch_in: '12:55:10', duration_secs: 3310,
    }));
  });
});
