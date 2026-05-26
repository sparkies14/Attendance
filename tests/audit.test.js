const mockInsert = jest.fn(() => Promise.resolve({ error: null }));
jest.mock('../lib/supabase', () => ({
  from: jest.fn(() => ({ insert: mockInsert })),
}));

const supabase = require('../lib/supabase');
const audit = require('../lib/audit');

beforeEach(() => {
  mockInsert.mockClear();
  supabase.from.mockClear();
  mockInsert.mockImplementation(() => Promise.resolve({ error: null }));
});

describe('ACTIONS', () => {
  test('exposes expected action constants', () => {
    expect(audit.ACTIONS.LOGIN).toBe('login');
    expect(audit.ACTIONS.LOGIN_FAILED).toBe('login_failed');
    expect(audit.ACTIONS.USER_PROMOTED).toBe('user_promoted');
    expect(audit.ACTIONS.ATTENDANCE_APPROVED).toBe('attendance_approved');
    expect(audit.ACTIONS.AUDIT_CLEANUP).toBe('audit_cleanup');
  });
});

describe('extractIp', () => {
  test('reads first ip from x-forwarded-for', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } };
    expect(audit.extractIp(req)).toBe('203.0.113.1');
  });

  test('falls back to socket.remoteAddress', () => {
    const req = { headers: {}, socket: { remoteAddress: '198.51.100.7' } };
    expect(audit.extractIp(req)).toBe('198.51.100.7');
  });

  test('returns null when nothing available', () => {
    expect(audit.extractIp({ headers: {} })).toBeNull();
    expect(audit.extractIp(null)).toBeNull();
  });

  test('trims whitespace', () => {
    const req = { headers: { 'x-forwarded-for': '   203.0.113.1   ,10.0.0.1' } };
    expect(audit.extractIp(req)).toBe('203.0.113.1');
  });
});

describe('extractActor', () => {
  test('prefers opts.actor when provided', () => {
    const req = { user: { user_id: 'u1', email: 'a@b.com', role: 'admin' } };
    const opts = { actor: { user_id: 'u2', email: 'x@y.com', role: 'owner' } };
    expect(audit.extractActor(req, opts)).toEqual({ user_id: 'u2', email: 'x@y.com', role: 'owner' });
  });

  test('falls back to req.user', () => {
    const req = { user: { user_id: 'u1', email: 'a@b.com', role: 'admin' } };
    expect(audit.extractActor(req, {})).toEqual({ user_id: 'u1', email: 'a@b.com', role: 'admin' });
  });

  test('returns nulls when neither available', () => {
    expect(audit.extractActor({}, {})).toEqual({ user_id: null, email: null, role: null });
    expect(audit.extractActor(null, {})).toEqual({ user_id: null, email: null, role: null });
  });
});

describe('log', () => {
  test('inserts a row with all fields populated', async () => {
    const req = {
      user: { user_id: 'u1', email: 'a@b.com', role: 'admin' },
      headers: { 'x-forwarded-for': '203.0.113.1', 'user-agent': 'jest-agent/1.0' },
    };
    await audit.log(req, audit.ACTIONS.USER_PROMOTED, {
      target_user_id: 'u2',
      target_table: 'users',
      target_id: 'u2',
      details: { previous_role: 'member', new_role: 'admin' },
    });
    expect(supabase.from).toHaveBeenCalledWith('audit_log');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.actor_user_id).toBe('u1');
    expect(row.actor_email).toBe('a@b.com');
    expect(row.actor_role).toBe('admin');
    expect(row.action).toBe('user_promoted');
    expect(row.target_user_id).toBe('u2');
    expect(row.target_table).toBe('users');
    expect(row.target_id).toBe('u2');
    expect(row.details).toEqual({ previous_role: 'member', new_role: 'admin' });
    expect(row.ip_address).toBe('203.0.113.1');
    expect(row.user_agent).toBe('jest-agent/1.0');
  });

  test('respects explicit opts.actor (for failed logins)', async () => {
    const req = { headers: {} };
    await audit.log(req, audit.ACTIONS.LOGIN_FAILED, {
      actor: { user_id: null, email: 'attacker@x.com', role: null },
      details: { reason: 'bad_password' },
    });
    const row = mockInsert.mock.calls[0][0];
    expect(row.actor_user_id).toBeNull();
    expect(row.actor_email).toBe('attacker@x.com');
    expect(row.action).toBe('login_failed');
    expect(row.details).toEqual({ reason: 'bad_password' });
  });

  test('coerces numeric target_id to string', async () => {
    await audit.log({ headers: {} }, audit.ACTIONS.ATTENDANCE_APPROVED, {
      target_table: 'attendance',
      target_id: 42,
    });
    expect(mockInsert.mock.calls[0][0].target_id).toBe('42');
  });

  test('swallows insert errors (does not throw)', async () => {
    mockInsert.mockImplementationOnce(() => { throw new Error('db down'); });
    const origErr = console.error;
    console.error = jest.fn();
    await expect(
      audit.log({ headers: {} }, audit.ACTIONS.LOGIN, {})
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    console.error = origErr;
  });

  test('uses null for missing optional fields', async () => {
    await audit.log({ headers: {} }, audit.ACTIONS.LOGIN, {});
    const row = mockInsert.mock.calls[0][0];
    expect(row.target_user_id).toBeNull();
    expect(row.target_table).toBeNull();
    expect(row.target_id).toBeNull();
    expect(row.details).toBeNull();
    expect(row.ip_address).toBeNull();
    expect(row.user_agent).toBeNull();
  });
});
