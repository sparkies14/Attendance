const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../middleware/requireRole', () => (..._roles) => (req, _res, next) => next());
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router   = require('../routes/dashboard');

// Chainable builder; records every .eq(col,val) into `rec` if provided.
function builder(result, rec) {
  const b = {};
  ['select', 'insert', 'update', 'delete', 'order', 'gte', 'lte', 'in'].forEach(m => (b[m] = jest.fn(() => b)));
  b.eq = jest.fn((col, val) => { if (rec) rec.push([col, val]); return b; });
  b.maybeSingle = jest.fn(() => Promise.resolve(result));
  b.then = (r) => r(result);
  return b;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email: 'admin@x.com', role: 'owner', user_id: 'a1' }; next(); });
  app.use('/', router);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('GET / — absent bug (date-format root cause)', () => {
  test('queries attendance with ISO (YYYY-MM-DD) date, so a clocked-in member is not Absent', async () => {
    const attEqs = [];
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: [{ name: 'Maria Cruz', email: 'maria@x.com', job_role: 'Dev', status: 'Active' }] });
      if (t === 'attendance') return builder({ data: [{ email: 'maria@x.com', clock_in: '09:00:00', clock_out: '', late_status: 'ON TIME', status: 'Approved' }] }, attEqs);
      return builder({ data: [] }); // leave_log, break_log, lunch_log
    });

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    // The bug: dashboard used todayJST() => "M/D/YYYY", never matching stored "YYYY-MM-DD".
    expect(attEqs).toContainEqual(['date', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    const maria = res.body.members.find(m => m.email === 'maria@x.com');
    expect(maria.status).toBe('CLOCKED IN');
  });
});

describe('GET / — break/lunch/leave/emergency enrichment', () => {
  function setup(over = false) {
    supabase.from.mockImplementation((t) => {
      if (t === 'users') return builder({ data: [
        { name: 'Maria Cruz', email: 'maria@x.com', job_role: 'Dev', status: 'Active' },
        { name: 'Leo Tan',    email: 'leo@x.com',   job_role: 'QA',  status: 'Active' },
      ] });
      if (t === 'attendance') return builder({ data: [
        { email: 'maria@x.com', clock_in: '09:00:00', clock_out: '', late_status: 'ON TIME', status: 'Approved', emergency: false },
        { email: 'leo@x.com',   clock_in: '09:05:00', clock_out: '', late_status: 'ON TIME', status: 'Approved', emergency: true, emergency_reason: 'Family' },
      ] });
      if (t === 'break_log') return builder({ data: [
        { name: 'Maria Cruz', break_out: '10:30:00', break_in: '', duration_secs: 0 },
        { name: 'Maria Cruz', break_out: '09:30:00', break_in: '09:33:20', duration_secs: over ? 1000 : 200 },
      ] });
      if (t === 'lunch_log') return builder({ data: [
        { name: 'Leo Tan', lunch_out: '12:00:00', lunch_in: '', duration_secs: 0 },
      ] });
      if (t === 'leave_log') return builder({ data: [] });
      return builder({ data: [] });
    });
  }

  test('per-member break/lunch fields are computed', async () => {
    setup();
    const res = await request(makeApp()).get('/');
    const maria = res.body.members.find(m => m.email === 'maria@x.com');
    const leo   = res.body.members.find(m => m.email === 'leo@x.com');
    expect(maria.onBreak).toBe(true);
    expect(maria.breakStart).toBe('10:30:00');
    expect(maria.breakUsedSecs).toBe(200);
    expect(leo.onLunch).toBe(true);
    expect(leo.lunchStart).toBe('12:00:00');
  });

  test('summary includes onBreak/onLunch/overBudget/onLeave/emergency counts', async () => {
    setup();
    const res = await request(makeApp()).get('/');
    expect(res.body.summary.onBreak).toBe(1);
    expect(res.body.summary.onLunch).toBe(1);
    expect(res.body.summary.emergency).toBe(1);
    expect(res.body.summary.overBudget).toBe(0);
  });

  test('overBudget counts completed usage beyond budget', async () => {
    setup(true);
    const res = await request(makeApp()).get('/');
    expect(res.body.summary.overBudget).toBe(1);
  });

  test('payload exposes budgets', async () => {
    setup();
    const res = await request(makeApp()).get('/');
    expect(res.body.budgets).toEqual({ breakSecs: 900, lunchSecs: 3600 });
  });
});
