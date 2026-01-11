const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined, // removes pid, hostname if desired
});

module.exports = logger;
