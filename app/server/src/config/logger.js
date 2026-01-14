const pino = require('pino');

const logger =
  process.env.NODE_ENV === 'test'
    ? pino({ level: 'silent' })
    : pino();

module.exports = logger;
