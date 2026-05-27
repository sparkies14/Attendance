process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { signToken } = require('../lib/auth');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const requireSelfOrRole = require('../middleware/requireSelfOrRole');

function mockReq(headers = {}, query = {}, params = {}) {
  return { headers, query, params, user: undefined, cookies: {} };
}
function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('requireAuth', () => {
  test('401 when Authorization header missing', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 on malformed header (no Bearer prefix)', () => {
    const req = mockReq({ authorization: 'NoBearerHere' });
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 on invalid token', () => {
    const req = mockReq({ authorization: 'Bearer not-a-real-token' });
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('attaches req.user and calls next on valid token', () => {
    const token = signToken({ user_id: 'u1', email: 'a@b.com', role: 'admin' });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.user_id).toBe('u1');
    expect(req.user.email).toBe('a@b.com');
    expect(req.user.role).toBe('admin');
  });

  test('authenticates via att_token cookie when no Bearer header', () => {
    const token = signToken({ user_id: 'u2', email: 'b@c.com', role: 'admin' });
    const req = mockReq();
    req.cookies = { att_token: token };
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.user_id).toBe('u2');
    expect(req.user.email).toBe('b@c.com');
    expect(req.user.role).toBe('admin');
  });

  test('401 when cookie token is invalid', () => {
    const req = mockReq();
    req.cookies = { att_token: 'not-a-valid-jwt' };
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 when no Bearer header and no att_token cookie', () => {
    const req = mockReq();
    req.cookies = {};
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  test('403 when role not in allowed list', () => {
    const req = { user: { role: 'member' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('owner', 'admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('passes when role is in allowed list', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('owner', 'admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes for owner regardless of order', () => {
    const req = { user: { role: 'owner' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin', 'owner')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireSelfOrRole', () => {
  test('passes when caller acts on own email', () => {
    const req = { user: { email: 'me@a.com', role: 'member' }, query: { email: 'me@a.com' }, params: {} };
    const res = mockRes();
    const next = jest.fn();
    requireSelfOrRole('email', 'owner', 'admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes when caller has elevated role', () => {
    const req = { user: { email: 'admin@a.com', role: 'admin' }, query: { email: 'someone@b.com' }, params: {} };
    const res = mockRes();
    const next = jest.fn();
    requireSelfOrRole('email', 'owner', 'admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('403 when neither self nor elevated', () => {
    const req = { user: { email: 'me@a.com', role: 'member' }, query: { email: 'someone@b.com' }, params: {} };
    const res = mockRes();
    const next = jest.fn();
    requireSelfOrRole('email', 'owner', 'admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when target email is missing', () => {
    const req = { user: { email: 'me@a.com', role: 'member' }, query: {}, params: {} };
    const res = mockRes();
    const next = jest.fn();
    requireSelfOrRole('email', 'owner', 'admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
