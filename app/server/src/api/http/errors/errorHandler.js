const { AppError } = require('./AppError');
const logger = require('../../../observability/logger');
const { registerAuthFailure } = require('../../../observability/metrics');

module.exports = function errorHandler(err, req, res, _next) {
  const isAppError = err instanceof AppError;

  const status = isAppError ? err.status : 500;
  const code = isAppError ? err.code : 'INTERNAL';
  const message = isAppError ? err.message : 'Internal Server Error';

  logger.error(
    { err, requestId: req.id, method: req.method, path: req.originalUrl, status, code },
    message
  );

  if (status === 401 || status === 403) {
    registerAuthFailure(code);
  }

  res.status(status).json({
    error: {
      code,
      message,
      requestId: req.id,
      details: isAppError ? err.details : undefined,
    },
  });
};
