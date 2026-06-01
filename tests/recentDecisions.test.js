process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router = require('../routes/recentDecisions');

// Chainable Supabase stub. `.limit()` resolves (audit query terminal);
// awaiting the chain directly resolves too (enrichment `.in()` terminal).
function chain(result) {
  const ch = {
    select: jest.fn(() => ch),
    in:     jest.fn(() => ch),
    order:  jest.fn(() => ch),
    limit:  jest.fn(() => Promise.resolve(result)),
    then:   (resolve) => resolve(result),
  };
  return ch;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/webhook/recent-decisions', router);
  return app;
}

const adminToken = () => signToken({ user_id: 'u1', email: 'admin@x.com', role: 'admin' });
const memberToken = () => signToken({ user_id: 'u2', email: 'm@x.com', role: 'member' });

beforeEach(() => { jest.clearAllMocks(); });

describe('GET /webhook/recent-decisions', () => {
  test('leave type returns leave decisions enriched with leave_type label', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'audit_log') {
        return chain({ data: [
          { id: 100, action: 'leave_approved', actor_email: 'admin@x.com', target_id: '10', occurred_at: '2026-06-01T10:00:00Z' },
          { id: 99,  action: 'leave_rejected', actor_email: 'owner@x.com', target_id: '11', occurred_at: '2026-06-01T09:00:00Z' },
        ], error: null });
      }
      return chain({ data: [
        { id: 10, name: 'Carol Reyes', leave_type: 'Vacation' },
        { id: 11, name: 'Dan Lim',     leave_type: 'Sick leave' },
      ], error: null });
    });

    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=leave')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ result: 'approved', name: 'Carol Reyes', label: 'Vacation', actor: 'admin@x.com' });
    expect(res.body.items[1]).toMatchObject({ result: 'rejected', name: 'Dan Lim', label: 'Sick leave' });
  });

  test('attendance type labels rows as clock-in', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'audit_log') {
        return chain({ data: [
          { id: 5, action: 'attendance_approved', actor_email: 'admin@x.com', target_id: '42', occurred_at: '2026-06-01T10:00:00Z' },
        ], error: null });
      }
      return chain({ data: [{ id: 42, name: 'Alice Tan' }], error: null });
    });

    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=attendance')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ result: 'approved', name: 'Alice Tan', label: 'clock-in' });
  });

  test('missing source row falls back to Entry #id', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'audit_log') {
        return chain({ data: [
          { id: 7, action: 'leave_approved', actor_email: 'admin@x.com', target_id: '999', occurred_at: '2026-06-01T10:00:00Z' },
        ], error: null });
      }
      return chain({ data: [], error: null });
    });

    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=leave')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe('Entry #999');
    expect(res.body.items[0].label).toBe('Leave');
  });

  test('limit is clamped to MAX (50)', async () => {
    let capturedLimit = null;
    supabase.from.mockImplementation((table) => {
      const ch = chain({ data: [], error: null });
      if (table === 'audit_log') {
        ch.limit = jest.fn((n) => { capturedLimit = n; return Promise.resolve({ data: [], error: null }); });
      }
      return ch;
    });

    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=leave&limit=999')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(capturedLimit).toBe(50);
  });

  test('rejects non-admin with 403', async () => {
    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=leave')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(403);
  });

  test('requires authentication', async () => {
    const res = await request(makeApp()).get('/webhook/recent-decisions?type=leave');
    expect(res.status).toBe(401);
  });
});
