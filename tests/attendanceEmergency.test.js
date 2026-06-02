process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));
const mockSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/discord', () => ({ sendMessage: mockSend, CHANNELS: { clockLogs: 'c1' } }));

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

function builder(result) {
  const b = {};
  ['select','insert','update','delete','eq','order','gte','lte','in'].forEach(m => b[m] = jest.fn(() => b));
  b.maybeSingle = jest.fn(() => Promise.resolve(result));
  b.then = (r) => r(result);
  return b;
}
const ACTIVE_USER = { name: 'Maria Cruz', job_role: 'member', status: 'Active' };

beforeEach(() => { jest.clearAllMocks(); });

describe('emergency action', () => {
  test('400 when reason missing', async () => {
    supabase.from.mockImplementation(() => builder({ data: ACTIVE_USER }));
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'emergency', local_time: '14:00:00', date: '2026-06-02' });
    expect(res.status).toBe(400);
  });

  test('clocks out, sets emergency + reason, alerts admin', async () => {
    const updateBuilder = builder({ error: null });
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: ACTIVE_USER });
      // attendance: select open row → return one; update → capture
      const b = builder({ data: { id: 9, clock_in: '09:00:00', clock_out: '', last_clock_in: '09:00:00', accumulated_hours: 0 } });
      b.update = updateBuilder.update;
      return b;
    });
    const res = await request(makeApp())
      .post('/webhook/attendance')
      .set('Authorization', `Bearer ${token()}`)
      .send({ action: 'emergency', local_time: '14:00:00', date: '2026-06-02', reason: 'Family emergency' });
    expect(res.status).toBe(200);
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      clock_out: '14:00:00', emergency: true, emergency_reason: 'Family emergency', status: 'Approved',
    }));
    expect(mockSend).toHaveBeenCalled();
    expect(mockSend.mock.calls[0][1]).toMatch(/EMERGENCY/i);
  });
});
