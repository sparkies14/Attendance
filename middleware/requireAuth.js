const { verifyToken } = require('../lib/auth');

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  let token;

  if (header && header.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else if (req.cookies?.att_token) {
    token = req.cookies.att_token;
  } else {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  req.user = { user_id: payload.user_id, email: payload.email, role: payload.role };
  next();
};
