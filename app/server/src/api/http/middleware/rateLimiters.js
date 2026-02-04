const rateLimit = require('express-rate-limit');

const baseOptions = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
};

const loginLimiter = rateLimit({
  ...baseOptions,
  max: 20,
});

const readLimiter = rateLimit({
  ...baseOptions,
  max: 120,
});

const writeLimiter = rateLimit({
  ...baseOptions,
  max: 60,
});

module.exports = { loginLimiter, readLimiter, writeLimiter };
