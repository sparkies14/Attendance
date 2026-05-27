process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const { hashPassword, signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));
jest.mock('../lib/audit', () => ({
  log: jest.fn().mockResolvedValue(undefined),
  ACTIONS: {
    LOGIN: 'login', LOGIN_FAILED: 'login_failed',
    LOGIN_GOOGLE: 'login_google', LOGIN_GOOGLE_FAILED: 'login_google_failed',
    REGISTER: 'register',
  },
}));

const supabase = require('../lib/supabase');
const router   = require('../routes/auth');

function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:        (resolve) => resolve(result),
    select:      jest.fn(() => ch),
    eq:          jest.fn(() => ch),
    update:      jest.fn(() => ch),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single:      jest.fn(() => Promise.resolve(result)),
    insert:      jest.fn(() => ch),
  };
  return ch;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  return app;
}

let PASSWORD_HASH;
beforeAll(async () => { PASSWORD_HASH = await hashPassword('pass1234'); });
beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });

/* ─── POST /auth/login ─── */
describe('POST /auth/login — cookie', () => {
  test('sets httpOnly att_token cookie on successful login', async () => {
    const user = {
      id: 'u1', email: 'a@b.com', name: 'Alice',
      role: 'member', status: 'Active', password_hash: PASSWORD_HASH,
    };
    supabase.from
      .mockReturnValueOnce(c(user))   // select user by email
      .mockReturnValueOnce(c(null));  // update last_login_at

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'pass1234' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/att_token=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
    expect(cookies[0]).toMatch(/SameSite=Lax/i);
    const cookieValue = cookies[0].split(';')[0].split('=').slice(1).join('=');
    expect(cookieValue).toBe(res.body.token);
  });

  test('does not set cookie on failed login', async () => {
    supabase.from.mockReturnValueOnce(c(null)); // user not found

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ email: 'x@b.com', password: 'pass1234' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

/* ─── POST /auth/google ─── */
describe('POST /auth/google — cookie', () => {
  test('sets att_token cookie on successful Google login', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: 'gsub-1', email: 'a@b.com', name: 'Alice' }),
    });
    const user = {
      id: 'u1', email: 'a@b.com', name: 'Alice',
      role: 'member', status: 'Active', google_sub: 'gsub-1',
    };
    supabase.from
      .mockReturnValueOnce(c(user))   // select by google_sub
      .mockReturnValueOnce(c(null));  // update last_login_at

    const res = await request(makeApp())
      .post('/auth/google')
      .send({ credential: 'fake-google-token' });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/att_token=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
    expect(cookies[0]).toMatch(/SameSite=Lax/i);
    const cookieValue = cookies[0].split(';')[0].split('=').slice(1).join('=');
    expect(cookieValue).toBe(res.body.token);
  });
});

/* ─── POST /auth/set-cookie ─── */
describe('POST /auth/set-cookie', () => {
  test('sets att_token cookie with a valid JWT', async () => {
    const token = signToken({ user_id: 'u1', email: 'a@b.com', role: 'member', name: 'Alice' });

    const res = await request(makeApp())
      .post('/auth/set-cookie')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/att_token=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
    expect(cookies[0]).toMatch(/SameSite=Lax/i);
    const cookieValue = cookies[0].split(';')[0].split('=').slice(1).join('=');
    expect(cookieValue).toBe(token);
  });

  test('returns 401 with an invalid JWT', async () => {
    const res = await request(makeApp())
      .post('/auth/set-cookie')
      .send({ token: 'not-a-valid-jwt' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('returns 401 when token is missing', async () => {
    const res = await request(makeApp())
      .post('/auth/set-cookie')
      .send({});

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
