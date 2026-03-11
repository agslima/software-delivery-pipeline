const env = require('./env');

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAlphaNumHyphen = (value) => value.split('').every((char) => (
  (char >= 'a' && char <= 'z')
  || (char >= '0' && char <= '9')
  || char === '-'
));

const hasTrustedPreviewHostname = (hostname, suffix) => {
  if (!hostname.endsWith(suffix)) return false;

  const subdomain = hostname.slice(0, -suffix.length);
  return Boolean(subdomain) && isAlphaNumHyphen(subdomain);
};

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
    || hasTrustedPreviewHostname(hostname, '.app.github.dev')
    || hasTrustedPreviewHostname(hostname, '.githubpreview.dev');
};

module.exports = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
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
