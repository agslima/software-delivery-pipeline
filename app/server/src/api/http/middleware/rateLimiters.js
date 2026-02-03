const rateLimit = require('express-rate-limit');

const baseOptions = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
};

const loginLimiter = rateLimit({
  ...baseOptions,
  max: 100,
});

const readLimiter = rateLimit({
  ...baseOptions,
  max: 100,
});

module.exports = { loginLimiter, readLimiter };
