const env = require('./env');

const allowlistedOrigins = new Set(
  env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
);

const isAllowedOriginPattern = (origin) => {
  let parsedOrigin;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    return false;
  }

  const hostname = parsedOrigin.hostname.toLowerCase();

  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || allowlistedOrigins.has(parsedOrigin.origin);
};

module.exports = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowlistedOrigins.has(origin)) {
      return callback(null, true);
    }

    if (isAllowedOriginPattern(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
};
