// /server/src/middlewares/auth.middleware.js
const tokenService = require('../services/jwt-token.service');

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.split(' ')[1];

  try {
    req.user = tokenService.verify(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
