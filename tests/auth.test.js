process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  canPerformRoleAction,
} = require('../lib/auth');

const jwt = require('jsonwebtoken');

describe('hashPassword + verifyPassword', () => {
  test('hash is not the plain password', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).not.toBe('correct horse');
    expect(hash.length).toBeGreaterThan(20);
  });

  test('verify returns true for the right password', async () => {
    const hash = await hashPassword('hunter2');
    expect(await verifyPassword('hunter2', hash)).toBe(true);
  });

  test('verify returns false for the wrong password', async () => {
    const hash = await hashPassword('hunter2');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  test('verify returns false when hash is null', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
  });
});

describe('signToken + verifyToken', () => {
  test('round-trip preserves payload fields', () => {
    const token = signToken({ user_id: 'abc', email: 'a@b.com', role: 'admin' });
    const payload = verifyToken(token);
    expect(payload.user_id).toBe('abc');
    expect(payload.email).toBe('a@b.com');
    expect(payload.role).toBe('admin');
  });

  test('verify returns null on tampered token', () => {
    const token = signToken({ user_id: 'abc', email: 'a@b.com', role: 'member' });
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(verifyToken(tampered)).toBeNull();
  });

  test('verify returns null on expired token', () => {
    const expired = jwt.sign(
      { user_id: 'abc', email: 'a@b.com', role: 'member' },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    );
    expect(verifyToken(expired)).toBeNull();
  });

  test('verify returns null on garbage input', () => {
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('')).toBeNull();
    expect(verifyToken(null)).toBeNull();
  });
});

describe('canPerformRoleAction', () => {
  test('owner can promote member', () => {
    expect(canPerformRoleAction('owner', 'member', 'promote')).toBe(true);
  });
  test('admin cannot promote anyone', () => {
    expect(canPerformRoleAction('admin', 'member', 'promote')).toBe(false);
  });
  test('member cannot promote', () => {
    expect(canPerformRoleAction('member', 'member', 'promote')).toBe(false);
  });
  test('promote on a non-member is rejected', () => {
    expect(canPerformRoleAction('owner', 'admin', 'promote')).toBe(false);
  });

  test('owner can demote admin', () => {
    expect(canPerformRoleAction('owner', 'admin', 'demote')).toBe(true);
  });
  test('admin cannot demote admin', () => {
    expect(canPerformRoleAction('admin', 'admin', 'demote')).toBe(false);
  });
  test('demote on a non-admin is rejected', () => {
    expect(canPerformRoleAction('owner', 'member', 'demote')).toBe(false);
  });
  test('owner cannot be demoted', () => {
    expect(canPerformRoleAction('owner', 'owner', 'demote')).toBe(false);
  });

  test('admin can activate member', () => {
    expect(canPerformRoleAction('admin', 'member', 'activate')).toBe(true);
  });
  test('admin cannot activate admin', () => {
    expect(canPerformRoleAction('admin', 'admin', 'activate')).toBe(false);
  });
  test('owner can activate admin', () => {
    expect(canPerformRoleAction('owner', 'admin', 'activate')).toBe(true);
  });
  test('admin cannot deactivate admin', () => {
    expect(canPerformRoleAction('admin', 'admin', 'deactivate')).toBe(false);
  });
  test('admin can deactivate member', () => {
    expect(canPerformRoleAction('admin', 'member', 'deactivate')).toBe(true);
  });
  test('owner cannot deactivate owner', () => {
    expect(canPerformRoleAction('owner', 'owner', 'deactivate')).toBe(false);
  });

  test('owner can invite admin', () => {
    expect(canPerformRoleAction('owner', 'admin', 'invite')).toBe(true);
  });
  test('owner can invite member', () => {
    expect(canPerformRoleAction('owner', 'member', 'invite')).toBe(true);
  });
  test('admin can invite member', () => {
    expect(canPerformRoleAction('admin', 'member', 'invite')).toBe(true);
  });
  test('admin cannot invite admin', () => {
    expect(canPerformRoleAction('admin', 'admin', 'invite')).toBe(false);
  });
  test('no one can invite an owner', () => {
    expect(canPerformRoleAction('owner', 'owner', 'invite')).toBe(false);
  });
});
