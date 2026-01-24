const pinoHttp = require('pino-http');
const logger = require('../../../observability/logger');

module.exports = pinoHttp({
  logger,
  customProps: (req, res) => ({
    requestId: req.id,
    statusCode: res.statusCode,
  }),
});

