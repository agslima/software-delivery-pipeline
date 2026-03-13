const env = require('../../../config/env');

const COOKIE_NAME = 'refresh_token';

/**
 * Determine whether refresh cookies should be marked Secure.
 *
 * @returns {boolean} True when production or TLS enforcement requires secure cookies.
 */
const shouldUseSecureCookies = () => env.NODE_ENV === 'production' || env.ENFORCE_TLS;

/**
 * Build the shared cookie attribute list for refresh token headers.
 *
 * @param {number} maxAgeSeconds - Cookie lifetime in seconds.
 * @returns {string[]} Ordered cookie attribute fragments.
 */
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

/**
 * Set the refresh token cookie on an HTTP response.
 *
 * @param {import('http').ServerResponse} res - Response object receiving the cookie header.
 * @param {string} token - Refresh token value to encode.
 */
const setRefreshTokenCookie = (res, token) => {
  const maxAgeSeconds = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
  const parts = buildCookieAttributes(maxAgeSeconds);
  parts[0] = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  res.setHeader('Set-Cookie', parts.join('; '));
};

/**
 * Expire the refresh token cookie on an HTTP response.
 *
 * @param {import('http').ServerResponse} res - Response object receiving the clearing header.
 */
const clearRefreshTokenCookie = (res) => {
  const parts = buildCookieAttributes(0);
  parts[0] = `${COOKIE_NAME}=`;
  res.setHeader('Set-Cookie', parts.join('; '));
};

/**
 * Extract the refresh token cookie value from an incoming request.
 *
 * @param {import('http').IncomingMessage} req - Request carrying the Cookie header.
 * @returns {string|null} Decoded refresh token value, or `null` when absent.
 */
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
