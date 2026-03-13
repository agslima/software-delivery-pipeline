const { createHash, timingSafeEqual } = require('crypto');
const { AppError } = require('../errors/AppError');
const env = require('../../../config/env');

const hashToken = (value) => createHash('sha256').update(value, 'utf8').digest();

module.exports = function metricsAuth(req, _res, next) {
  if (!env.METRICS_AUTH_TOKEN) return next();

  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
  }

  const token = header.slice('Bearer '.length).trim();
  const providedTokenHash = hashToken(token);
  const configuredTokenHash = hashToken(env.METRICS_AUTH_TOKEN);

  if (!timingSafeEqual(providedTokenHash, configuredTokenHash)) {
    return next(new AppError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' }));
  }

  return next();
};
