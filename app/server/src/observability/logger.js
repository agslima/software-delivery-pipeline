const pino = require('pino');
const env = require('../config/env');

module.exports = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.metadata.secrets',
      '*.metadata.refreshToken',
      '*.metadata.token',
      '*.metadata.password',
      '*.metadata.mfaCode',
    ],
    remove: true,
  },
});
