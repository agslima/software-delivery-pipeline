const { AppError } = require('../errors/AppError');
const tokenService = require('../../../infra/auth/jwtToken.service');

module.exports = function auth(req, _res, next) {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    req.user = tokenService.verify(token);
    return next();
  } catch {
    return next(new AppError({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' }));
  }
};

