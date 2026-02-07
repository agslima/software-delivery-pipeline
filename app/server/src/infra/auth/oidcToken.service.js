const jwt = require('jsonwebtoken');
const { createPublicKey } = require('crypto');
const oidcConfig = require('../../config/oidc');
const { AppError } = require('../../api/http/errors/AppError');

const DEFAULT_JWKS_CACHE_MS = 10 * 60 * 1000;
const ALLOWED_ALGS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'];

const jwksCache = {
  keys: null,
  expiresAt: 0,
  inFlight: null,
};

const fetchJwks = async () => {
  if (!oidcConfig.jwksUri) {
    throw new AppError({ status: 500, code: 'OIDC_NOT_CONFIGURED', message: 'OIDC not configured' });
  }

  const now = Date.now();
  if (jwksCache.keys && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }

  if (jwksCache.inFlight) {
    return jwksCache.inFlight;
  }

  jwksCache.inFlight = (async () => {
    const response = await fetch(oidcConfig.jwksUri, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new AppError({ status: 500, code: 'OIDC_JWKS_FETCH_FAILED', message: 'OIDC JWKS fetch failed' });
    }

    const body = await response.json();
    if (!body || !Array.isArray(body.keys)) {
      throw new AppError({ status: 500, code: 'OIDC_JWKS_INVALID', message: 'OIDC JWKS invalid' });
    }

    jwksCache.keys = body.keys;
    jwksCache.expiresAt = now + DEFAULT_JWKS_CACHE_MS;
    jwksCache.inFlight = null;

    return jwksCache.keys;
  })();

  try {
    return await jwksCache.inFlight;
  } finally {
    jwksCache.inFlight = null;
  }
};

const getKeyForKid = async (kid) => {
  const keys = await fetchJwks();
  const jwk = keys.find((entry) => entry.kid === kid);
  if (!jwk) {
    throw new AppError({ status: 401, code: 'OIDC_KEY_NOT_FOUND', message: 'Invalid token' });
  }

  try {
    return createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    throw new AppError({ status: 401, code: 'OIDC_KEY_INVALID', message: 'Invalid token' });
  }
};

class OidcTokenService {
  constructor({ issuer, audience, clockToleranceSeconds } = {}) {
    this.issuer = issuer;
    this.audience = audience;
    this.clockToleranceSeconds = clockToleranceSeconds || 5;
  }

  async verify(token) {
    if (!this.issuer || !this.audience) {
      throw new AppError({ status: 500, code: 'OIDC_NOT_CONFIGURED', message: 'OIDC not configured' });
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) {
      throw new AppError({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' });
    }

    const { kid, alg } = decoded.header;
    if (!kid || !alg || !ALLOWED_ALGS.includes(alg)) {
      throw new AppError({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' });
    }

    const key = await getKeyForKid(kid);
    return jwt.verify(token, key, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: [alg],
      clockTolerance: this.clockToleranceSeconds,
    });
  }
}

module.exports = new OidcTokenService({
  issuer: oidcConfig.issuer,
  audience: oidcConfig.audience,
  clockToleranceSeconds: oidcConfig.clockToleranceSeconds,
});
