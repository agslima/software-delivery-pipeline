const logger = require('../utils/logger');

module.exports = (err, req, res, _next) => {
  const status = err.statusCode || 500;

  logger.error({
    err,
    requestId: req.id,
    path: req.originalUrl,
    method: req.method,
  }, err.message);

  res.status(status).json({
    error: {
      message: err.message || 'Internal Server Error',
      requestId: req.id,
    },
  });
};
