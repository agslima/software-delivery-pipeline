const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.LOG_LEVEL, 
  base: undefined,
});

module.exports = logger;
