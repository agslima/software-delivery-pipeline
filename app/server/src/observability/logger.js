const pino = require('pino');
const env = require('../config/env');

module.exports = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    remove: true,
  },
});

