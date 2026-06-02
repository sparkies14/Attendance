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
