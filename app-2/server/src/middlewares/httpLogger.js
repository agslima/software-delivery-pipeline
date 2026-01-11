const pinoHttp = require('pino-http');
const logger = require('../utils/logger');

module.exports = pinoHttp({
  logger,
  customProps: (req) => ({
    requestId: req.id,
  }),
});
