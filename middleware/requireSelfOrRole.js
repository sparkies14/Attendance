module.exports = function requireSelfOrRole(emailParam, ...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) return res.status(403).json({ error: 'Forbidden.' });
    if (allowedRoles.includes(req.user.role)) return next();
    const targetEmail = req.query[emailParam] || req.params[emailParam];
    if (targetEmail && targetEmail === req.user.email) return next();
    return res.status(403).json({ error: 'Forbidden.' });
  };
};
