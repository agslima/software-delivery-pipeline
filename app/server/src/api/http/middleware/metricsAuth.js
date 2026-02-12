const { AppError } = require('../errors/AppError');
const env = require('../../../config/env');

module.exports = function metricsAuth(req, _res, next) {
  if (!env.METRICS_AUTH_TOKEN) return next();

  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
  }

  const token = header.slice('Bearer '.length).trim();
  if (token !== env.METRICS_AUTH_TOKEN) {
    return next(new AppError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' }));
  }

  return next();
};
