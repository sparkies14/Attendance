process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router = require('../routes/memberData');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/webhook/member-data', router);
  return app;
}
const token = () => signToken({ user_id: 'u1', email: 'm@x.com', role: 'member' });

// Chainable builder that records every .eq(col, val) call into `rec`.
function builder(result, rec) {
  const b = {};
  ['select', 'insert', 'update', 'delete', 'order', 'gte', 'lte', 'in'].forEach(m => (b[m] = jest.fn(() => b)));
  b.eq = jest.fn((col, val) => { if (rec) rec.push([col, val]); return b; });
  b.maybeSingle = jest.fn(() => Promise.resolve(result));
  b.then = (r) => r(result);
  return b;
}

beforeEach(() => { jest.clearAllMocks(); });

describe('member-data break/lunch date matching (root-cause regression)', () => {
  test('queries break_log/lunch_log with ISO (YYYY-MM-DD) date — the format rows are stored in', async () => {
    const breakEqs = [];
    const lunchEqs = [];
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: { name: 'Maria Cruz', id: 1 } });
      if (t === 'break_log') return builder({ data: [{ break_out: '10:00:00', break_in: '', duration_secs: 0 }] }, breakEqs);
      if (t === 'lunch_log') return builder({ data: [] }, lunchEqs);
      return builder({ data: [] }); // attendance, leave_log, plan_events
    });

    const res = await request(makeApp())
      .get('/webhook/member-data?email=m@x.com&month=6&year=2026')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    // The bug: this used todayJST() => "M/D/YYYY", which never matches stored "YYYY-MM-DD" rows.
    expect(breakEqs).toContainEqual(['date', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    expect(lunchEqs).toContainEqual(['date', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    // And an open break row must surface as onBreak: true.
    expect(res.body.onBreak).toBe(true);
  });
});

describe('member-data lateManualRequired flag', () => {
  test('reports false when policy is off', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: { name: 'Maria Cruz', id: 1 } });
      if (t === 'policy_config') return builder({ data: { value: 'off' } });
      return builder({ data: [] });
    });
    const res = await request(makeApp())
      .get('/webhook/member-data?email=m@x.com&month=6&year=2026')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.lateManualRequired).toBe(false);
  });

  test('defaults to true when the policy row is missing', async () => {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: { name: 'Maria Cruz', id: 1 } });
      if (t === 'policy_config') return builder({ data: null });
      return builder({ data: [] });
    });
    const res = await request(makeApp())
      .get('/webhook/member-data?email=m@x.com&month=6&year=2026')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.body.lateManualRequired).toBe(true);
  });
});
