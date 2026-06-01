const request = require('supertest');
const express = require('express');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');

function c(data, error = null) {
  const result = { data, error };
  const ch = {
    select: jest.fn(() => ch),
    eq:     jest.fn(() => ch),
    update: jest.fn(() => ch),
    single: jest.fn(() => Promise.resolve(result)),
    then:   (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch:  () => Promise.resolve(result),
  };
  return ch;
}

function makeApp(router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { user_id: 1, email: 'test@test.com' }; next(); });
  app.use('/', router);
  return app;
}

describe('discordLink', () => {
  let mod;
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.doMock('../middleware/requireAuth', () => (req, _res, next) => {
      req.user = { user_id: 1, email: 'test@test.com' }; next();
    });
    jest.doMock('../lib/supabase', () => ({ from: jest.fn() }));
    mod = require('../routes/discordLink');
    mod._codeStore.clear();
  });

  test('verify with valid code links discord_id', async () => {
    mod.storeCode('123456789', '482931');
    const sb = require('../lib/supabase');
    const chain = c({ id: 1 });
    sb.from.mockReturnValue(chain);

    const res = await request(makeApp(mod.router)).post('/verify').send({ code: '482931' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('verify with wrong code returns 400', async () => {
    const res = await request(makeApp(mod.router)).post('/verify').send({ code: '000000' });
    expect(res.status).toBe(400);
  });

  test('verify with expired code returns 400', async () => {
    mod._codeStore.set('999', { code: '111111', expiresAt: Date.now() - 1000 });
    const res = await request(makeApp(mod.router)).post('/verify').send({ code: '111111' });
    expect(res.status).toBe(400);
  });

  test('createLinkCode returns a 6-digit string and stores it', () => {
    const code = mod.createLinkCode('abc123');
    expect(code).toMatch(/^\d{6}$/);
    expect(mod._codeStore.get('abc123').code).toBe(code);
  });
});
