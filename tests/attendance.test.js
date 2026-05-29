// tests/attendance.test.js
const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());
jest.mock('../lib/supabase', () => ({ from: jest.fn() }));
jest.mock('../lib/discord', () => ({
  sendMessage: jest.fn(() => Promise.resolve()),
  CHANNELS: { clockLogs: 'clock-logs', approvals: 'approvals' },
}));

const supabase = require('../lib/supabase');
const router = require('../routes/attendance');

// Chain builder: returns a chainable mock that ultimately resolves to { data, error }
function c(data, error = null) {
  const result = { data, error };
  const ch = {
    select:      jest.fn(() => ch),
    eq:          jest.fn(() => ch),
    insert:      jest.fn(() => Promise.resolve(result)),
    update:      jest.fn(() => ch),
    delete:      jest.fn(() => ch),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single:      jest.fn(() => Promise.resolve(result)),
  };
  return ch;
}

function makeApp(email = 'user@test.com') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email }; next(); });
  app.use('/', router);
  return app;
}

const ACTIVE_USER = { name: 'Test User', job_role: 'Developer', status: 'Active' };

const BASE_BODY = {
  action: 'clock-in',
  entry_type: 'biometric',
  local_time: '9:00 AM',
  date: '2026-05-29',
  jst_hour: 9,
  jst_minute: 0,
  fingerprint: 'fp-abc',
};

beforeEach(() => jest.clearAllMocks());

/* ─── First clock-in ─── */
describe('clock-in — first time', () => {
  test('creates record with last_clock_in and accumulated_hours=0', async () => {
    // 1st call: user lookup, 2nd call: duplicate check (no record), 3rd call: insert
    supabase.from
      .mockReturnValueOnce(c(ACTIVE_USER))   // users select
      .mockReturnValueOnce(c(null))           // attendance select (no existing)
      .mockReturnValueOnce(c(null));          // attendance insert

    const res = await request(makeApp())
      .post('/').send({ ...BASE_BODY, action: 'clock-in' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/clock in recorded/i);

    // Verify insert was called with last_clock_in and accumulated_hours
    const insertCall = supabase.from.mock.results[2].value.insert;
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        last_clock_in: '9:00 AM',
        accumulated_hours: 0,
      })
    );
  });
});

/* ─── Clock-in blocked when already clocked in ─── */
describe('clock-in — already clocked in', () => {
  test('returns 400 when record exists with clock_out empty', async () => {
    supabase.from
      .mockReturnValueOnce(c(ACTIVE_USER))
      .mockReturnValueOnce(c({ id: 1, clock_in: '9:00 AM', clock_out: '', last_clock_in: '9:00 AM', accumulated_hours: 0 }));

    const res = await request(makeApp())
      .post('/').send({ ...BASE_BODY, action: 'clock-in' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already clocked in/i);
  });
});

/* ─── Re-clock-in ─── */
describe('clock-in — re-clock-in (clock_out is filled)', () => {
  test('accumulates raw hours, resets clock_out, updates last_clock_in', async () => {
    // Existing record: clocked in at 9:00 AM, clocked out at 11:00 AM (2 raw hours)
    const existingRecord = {
      id: 1,
      clock_in: '9:00 AM',
      clock_out: '11:00 AM',
      last_clock_in: '9:00 AM',
      accumulated_hours: 0,
    };

    // Mock update chain: update returns a chain that resolves to no error
    const updateChain = c(null); // no error

    supabase.from
      .mockReturnValueOnce(c(ACTIVE_USER))       // users select
      .mockReturnValueOnce(c(existingRecord))    // attendance select
      .mockReturnValueOnce(updateChain);         // attendance update

    const res = await request(makeApp())
      .post('/').send({ ...BASE_BODY, action: 'clock-in', local_time: '1:00 PM' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/re-clock in recorded/i);

    // update should be called with accumulated_hours = 2 (0 + 2h), last_clock_in = '1:00 PM', clock_out = ''
    const updateCall = supabase.from.mock.results[2].value.update;
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        last_clock_in: '1:00 PM',
        clock_out: '',
        accumulated_hours: 2,
      })
    );
  });

  test('uses last_clock_in when available for segment calculation', async () => {
    // First clock-in at 9:00, last_clock_in reset to 11:30 AM (after a re-clock-in),
    // then clocked out at 12:30 PM → segment = 1 raw hour
    // already accumulated_hours = 1.5 from previous segment
    const existingRecord = {
      id: 1,
      clock_in: '9:00 AM',
      clock_out: '12:30 PM',
      last_clock_in: '11:30 AM',
      accumulated_hours: 1.5,
    };

    const updateChain = c(null);

    supabase.from
      .mockReturnValueOnce(c(ACTIVE_USER))
      .mockReturnValueOnce(c(existingRecord))
      .mockReturnValueOnce(updateChain);

    const res = await request(makeApp())
      .post('/').send({ ...BASE_BODY, action: 'clock-in', local_time: '2:00 PM' });

    expect(res.status).toBe(200);

    const updateCall = supabase.from.mock.results[2].value.update;
    // 12:30 - 11:30 = 60 min = 1 raw hour → 1.5 + 1 = 2.5
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        accumulated_hours: 2.5,
        last_clock_in: '2:00 PM',
        clock_out: '',
      })
    );
  });
});

/* ─── Clock-out ─── */
describe('clock-out', () => {
  test('computes total_hours correctly with accumulated_hours (sum, deduct 1h lunch)', async () => {
    // Worked 9:00 AM to 11:00 AM (2h raw), re-clocked in at 12:00 PM, now clocking out at 6:00 PM (6h raw)
    // accumulated_hours = 2, current segment = 6h → total raw = 8h → net = 8 - 1 = 7h
    const row = {
      id: 1,
      clock_in: '9:00 AM',
      clock_out: '',
      last_clock_in: '12:00 PM',
      accumulated_hours: 2,
    };

    const updateChain = c(null);

    supabase.from
      .mockReturnValueOnce(c(ACTIVE_USER))
      .mockReturnValueOnce(c(row))
      .mockReturnValueOnce(updateChain);

    const res = await request(makeApp())
      .post('/').send({ ...BASE_BODY, action: 'clock-out', local_time: '6:00 PM' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateCall = supabase.from.mock.results[2].value.update;
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        clock_out: '6:00 PM',
        total_hours: 7,
      })
    );
  });

  test('deducts 1h lunch when no accumulated_hours (simple single session)', async () => {
    // Clocked in at 9:00 AM, clocking out at 6:00 PM → 9h raw → 8h net
    const row = {
      id: 1,
      clock_in: '9:00 AM',
      clock_out: '',
      last_clock_in: '9:00 AM',
      accumulated_hours: 0,
    };

    const updateChain = c(null);

    supabase.from
      .mockReturnValueOnce(c(ACTIVE_USER))
      .mockReturnValueOnce(c(row))
      .mockReturnValueOnce(updateChain);

    const res = await request(makeApp())
      .post('/').send({ ...BASE_BODY, action: 'clock-out', local_time: '6:00 PM' });

    expect(res.status).toBe(200);

    const updateCall = supabase.from.mock.results[2].value.update;
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        total_hours: 8,
      })
    );
  });

  test('returns 400 when no record found', async () => {
    supabase.from
      .mockReturnValueOnce(c(ACTIVE_USER))
      .mockReturnValueOnce(c(null));

    const res = await request(makeApp())
      .post('/').send({ ...BASE_BODY, action: 'clock-out', local_time: '6:00 PM' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no clock-in record/i);
  });

  test('returns 400 when already clocked out', async () => {
    const row = {
      id: 1,
      clock_in: '9:00 AM',
      clock_out: '5:00 PM',
      last_clock_in: '9:00 AM',
      accumulated_hours: 0,
    };

    supabase.from
      .mockReturnValueOnce(c(ACTIVE_USER))
      .mockReturnValueOnce(c(row));

    const res = await request(makeApp())
      .post('/').send({ ...BASE_BODY, action: 'clock-out', local_time: '6:00 PM' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already clocked out/i);
  });
});
