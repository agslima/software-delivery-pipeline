const { AppError } = require('../errors/AppError');
const tokenService = require('../../../infra/auth/jwtToken.service');

module.exports = function mfaAuth(req, _res, next) {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = tokenService.verify(token);
    if (!payload || !payload.mfa) {
      return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
    }
    req.user = payload;
    return next();
  } catch {
    return next(new AppError({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' }));
  }
};
