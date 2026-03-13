const { AppError } = require('../errors/AppError');
const env = require('../../../config/env');

module.exports = function requireTls(req, _res, next) {
  if (!env.ENFORCE_TLS) return next();

  if (req.secure) {
    return next();
  }

  return next(new AppError({ status: 403, code: 'TLS_REQUIRED', message: 'TLS required' }));
};
