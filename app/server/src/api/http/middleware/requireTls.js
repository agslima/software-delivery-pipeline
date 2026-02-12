const { AppError } = require('../errors/AppError');
const env = require('../../../config/env');

module.exports = function requireTls(req, _res, next) {
  if (!env.ENFORCE_TLS) return next();

  const forwarded = req.headers['x-forwarded-proto'];
  const isForwardedSecure = typeof forwarded === 'string' && forwarded.split(',')[0].trim() === 'https';

  if (req.secure || isForwardedSecure) {
    return next();
  }

  return next(new AppError({ status: 403, code: 'TLS_REQUIRED', message: 'TLS required' }));
};
