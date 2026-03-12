const env = require('../../../config/env');

const COOKIE_NAME = 'refresh_token';

const shouldUseSecureCookies = () => env.NODE_ENV === 'production' || env.ENFORCE_TLS;

const buildCookieAttributes = (maxAgeSeconds) => {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/api/v2/auth',
    'SameSite=Strict',
  ];

  if (typeof maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }

  if (shouldUseSecureCookies()) {
    parts.push('Secure');
  }

  return parts;
};

const setRefreshTokenCookie = (res, token) => {
  const maxAgeSeconds = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
  const parts = buildCookieAttributes(maxAgeSeconds);
  parts[0] = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  res.setHeader('Set-Cookie', parts.join('; '));
};

const clearRefreshTokenCookie = (res) => {
  const parts = buildCookieAttributes(0);
  parts[0] = `${COOKIE_NAME}=`;
  res.setHeader('Set-Cookie', parts.join('; '));
};

const getRefreshTokenFromRequest = (req) => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  for (const pair of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = pair.trim().split('=');
    if (rawName !== COOKIE_NAME) {
      continue;
    }

    const rawValue = rawValueParts.join('=');
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
};

module.exports = {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
};
