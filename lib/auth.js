const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_COST = 12;
const TOKEN_TTL = '24h';

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function canPerformRoleAction(actorRole, targetRole, action) {
  if (targetRole === 'owner') return false;

  switch (action) {
    case 'promote':
      return actorRole === 'owner' && targetRole === 'member';

    case 'demote':
      return actorRole === 'owner' && targetRole === 'admin';

    case 'activate':
    case 'deactivate':
      if (targetRole === 'member') return actorRole === 'owner' || actorRole === 'admin';
      if (targetRole === 'admin')  return actorRole === 'owner';
      return false;

    case 'invite':
      if (actorRole === 'owner') return targetRole === 'admin' || targetRole === 'member';
      if (actorRole === 'admin') return targetRole === 'member';
      return false;

    default:
      return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  canPerformRoleAction,
};
