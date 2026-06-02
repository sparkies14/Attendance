const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
  next();
});
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/adminPolicyConfig');

function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:   (resolve) => resolve(result),
    select: jest.fn(() => ch),
    eq:     jest.fn(() => ch),
    update: jest.fn(() => ch),
    upsert: jest.fn(() => ch),
  };
  return ch;
}

const ROWS = [
  { key: 'threshold_minor_tardy', value: '3' },
  { key: 'threshold_major_tardy', value: '2' },
  { key: 'threshold_awol_half',   value: '1' },
  { key: 'threshold_awol_full',   value: '1' },
  { key: 'late_manual_required',  value: 'on' },
];

function makeApp(role) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email: 'x@x.com', role, user_id: 'u1' }; next(); });
  app.use('/admin', router); // mirror server.js mounting so tests exercise the real /admin/policy-config path
  return app;
}

beforeEach(() => { jest.clearAllMocks(); supabase.from.mockReturnValue(c(ROWS)); });

describe('GET /', () => {
  test('returns integer thresholds and lateManualRequired boolean', async () => {
    const res = await request(makeApp('admin')).get('/admin/policy-config');
    expect(res.status).toBe(200);
    expect(res.body.config).toEqual({ threshold_minor_tardy: 3, threshold_major_tardy: 2, threshold_awol_half: 1, threshold_awol_full: 1 });
    expect(res.body.lateManualRequired).toBe(true);
  });
});

describe('PATCH /', () => {
  test('admin can toggle late_manual_required (upsert called with the new value)', async () => {
    const ch = c(ROWS);
    ch.upsert = jest.fn(() => ch);
    supabase.from.mockReturnValue(ch);
    const res = await request(makeApp('admin')).patch('/admin/policy-config').send({ late_manual_required: 'off' });
    expect(res.status).toBe(200);
    expect(ch.upsert).toHaveBeenCalledWith({ key: 'late_manual_required', value: 'off' });
  });

  test('admin sending toggle + threshold together is rejected before any write (403)', async () => {
    const ch = c(ROWS);
    ch.upsert = jest.fn(() => ch);
    ch.update = jest.fn(() => ch);
    supabase.from.mockReturnValue(ch);
    const res = await request(makeApp('admin')).patch('/admin/policy-config').send({ late_manual_required: 'off', threshold_minor_tardy: 5 });
    expect(res.status).toBe(403);
    expect(ch.upsert).not.toHaveBeenCalled();
    expect(ch.update).not.toHaveBeenCalled();
  });

  test('empty body returns 200 with current config unchanged', async () => {
    const res = await request(makeApp('owner')).patch('/admin/policy-config').send({});
    expect(res.status).toBe(200);
    expect(res.body.lateManualRequired).toBe(true);
  });

  test('admin CANNOT change a threshold (403)', async () => {
    const res = await request(makeApp('admin')).patch('/admin/policy-config').send({ threshold_minor_tardy: 5 });
    expect(res.status).toBe(403);
  });

  test('owner can change a threshold', async () => {
    const res = await request(makeApp('owner')).patch('/admin/policy-config').send({ threshold_minor_tardy: 5 });
    expect(res.status).toBe(200);
  });

  test('invalid toggle value is rejected (400)', async () => {
    const res = await request(makeApp('owner')).patch('/admin/policy-config').send({ late_manual_required: 'maybe' });
    expect(res.status).toBe(400);
  });

  test('unknown key is rejected (400)', async () => {
    const res = await request(makeApp('owner')).patch('/admin/policy-config').send({ nope: 1 });
    expect(res.status).toBe(400);
  });
});
