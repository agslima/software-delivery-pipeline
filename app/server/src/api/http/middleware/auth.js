const { AppError } = require('../errors/AppError');
const tokenService = require('../../../infra/auth/jwtToken.service');
const oidcTokenService = require('../../../infra/auth/oidcToken.service');
const oidcConfig = require('../../../config/oidc');
const { UsersRepository } = require('../../../infra/users/users.repository');

const usersRepository = new UsersRepository();

const resolveOidcUser = async (payload) => {
  const emailClaim = oidcConfig.emailClaim || 'email';
  const rawEmail = payload?.[emailClaim] || payload?.email || null;
  const email = rawEmail ? String(rawEmail).toLowerCase().trim() : null;

  if (!email) {
    throw new AppError({ status: 401, code: 'OIDC_CLAIM_MISSING', message: 'Unauthorized' });
  }

  const user = await usersRepository.findByEmail(email);
  if (!user) {
    throw new AppError({ status: 401, code: 'OIDC_USER_NOT_FOUND', message: 'Unauthorized' });
  }

  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    mfaEnabled: user.mfa_enabled,
    oidc: true,
    oidcSub: payload.sub,
  };
};

module.exports = async function auth(req, _res, next) {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
  }

  const token = header.slice('Bearer '.length).trim();
  const decoded = tokenService.decode(token);
  const decodedAudience = decoded?.aud;
  const audienceMatches = Array.isArray(decodedAudience)
    ? decodedAudience.includes(oidcConfig.audience)
    : decodedAudience === oidcConfig.audience;
  const isOidcToken = Boolean(
    oidcConfig.enabled &&
      decoded?.iss &&
      oidcConfig.issuer &&
      decoded.iss === oidcConfig.issuer &&
      audienceMatches
  );

  if (oidcConfig.required && !isOidcToken) {
    return next(new AppError({ status: 401, code: 'OIDC_REQUIRED', message: 'Unauthorized' }));
  }

  if (isOidcToken) {
    try {
      const payload = await oidcTokenService.verify(token);
      req.user = await resolveOidcUser(payload);
      return next();
    } catch (err) {
      if (err instanceof AppError) {
        return next(err);
      }
      return next(new AppError({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' }));
    }
  }

  try {
    const payload = tokenService.verify(token);
    if (payload?.mfa) {
      return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
    }
    req.user = payload;
    return next();
  } catch {
    return next(new AppError({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' }));
  }
};
