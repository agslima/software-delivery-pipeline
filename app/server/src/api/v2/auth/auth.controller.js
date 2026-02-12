const { PasswordAuthService } = require('../../../core/auth/passwordAuth.service');
const { LoginLockout } = require('../../../core/auth/loginLockout');
const { RefreshTokenService } = require('../../../core/auth/refreshToken.service');
const { MfaService } = require('../../../core/auth/mfa.service');
const { AuditService } = require('../../../core/v2/audit.service');
const { AuditRepository } = require('../../../infra/v2/audit.repository');
const { AuditConsoleRepository } = require('../../../infra/v2/audit.console.repository');
const auditConfig = require('../../../config/audit');
const { RefreshTokensRepository } = require('../../../infra/v2/refreshTokens.repository');
const { UsersRepository } = require('../../../infra/users/users.repository');
const tokenService = require('../../../infra/auth/jwtToken.service');
const { AppError } = require('../../http/errors/AppError');
const env = require('../../../config/env');
const { buildAuditContext, safeAudit } = require('../audit/audit.helpers');

const lockout = new LoginLockout({
  maxFailures: env.LOGIN_MAX_FAILURES,
  lockoutMinutes: env.LOGIN_LOCK_MINUTES,
  windowMinutes: env.LOGIN_FAILURE_WINDOW_MINUTES,
});

const usersRepository = new UsersRepository();
const service = new PasswordAuthService({
  usersRepository,
  tokenService,
  lockout,
});
const refreshTokenService = new RefreshTokenService({
  refreshTokensRepository: new RefreshTokensRepository(),
  usersRepository,
  tokenService,
  ttlDays: env.REFRESH_TOKEN_TTL_DAYS,
});
const mfaService = new MfaService({ usersRepository });
const auditRepository = auditConfig.sink === 'console' ? new AuditConsoleRepository() : new AuditRepository();
const auditService = new AuditService({ auditRepository });

exports.login = async (req, res, next) => {
  try {
    const payload = await service.login(req.body);
    if (payload.user.mfaEnabled) {
      const mfaToken = tokenService.signWithOptions(
        {
          sub: payload.user.id,
          email: payload.user.email,
          role: payload.user.role,
          mfa: true,
        },
        { expiresIn: `${env.MFA_TOKEN_TTL_MINUTES}m` }
      );
      return res.status(200).json({ mfaRequired: true, mfaToken, user: payload.user });
    }

    const refresh = await refreshTokenService.issue(payload.user.id);
    return res.status(200).json({ ...payload, refreshToken: refresh.refreshToken });
  } catch (err) {
    if (err?.code === 'INVALID_CREDENTIALS' || err?.code === 'ACCOUNT_LOCKED') {
      const auditContext = buildAuditContext(req);
      await safeAudit(auditService, {
        ...auditContext,
        eventType: 'login_failed',
        subjectType: 'user',
        subjectId: null,
        metadata: {
          ...auditContext.metadata,
          email: req.body?.email || null,
          reason: err.code,
        },
      });
    }
    return next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const payload = await refreshTokenService.rotate(refreshToken);
    return res.status(200).json(payload);
  } catch (err) {
    return next(err);
  }
};

exports.revoke = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const payload = await refreshTokenService.revoke(refreshToken);
    const auditContext = buildAuditContext(req);
    if (payload.revoked && payload.userId) {
      await safeAudit(auditService, {
        ...auditContext,
        actorUserId: payload.userId,
        eventType: 'refresh_token_revoked',
        subjectType: 'user',
        subjectId: payload.userId,
        redactionMode: auditConfig.piiRedaction,
        metadata: {
          ...auditContext.metadata,
        },
      });
    }
    if (!payload.revoked) {
      await safeAudit(auditService, {
        ...auditContext,
        actorUserId: payload.userId || null,
        eventType: 'refresh_token_revoke_failed',
        subjectType: 'user',
        subjectId: payload.userId || null,
        redactionMode: auditConfig.piiRedaction,
        metadata: {
          ...auditContext.metadata,
          reason: payload.reason || 'UNKNOWN',
        },
      });
    }
    return res.status(200).json({ revoked: true });
  } catch (err) {
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      actorUserId: req.user?.sub || null,
      eventType: 'refresh_token_revoke_failed',
      subjectType: 'user',
      subjectId: req.user?.sub || null,
      redactionMode: auditConfig.piiRedaction,
      metadata: {
        ...auditContext.metadata,
        reason: err?.code || 'UNKNOWN',
      },
    });
    return next(err);
  }
};

exports.revokeAll = async (req, res, next) => {
  try {
    await refreshTokenService.revokeAll(req.user.sub);
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      actorUserId: req.user.sub,
      eventType: 'refresh_tokens_revoked_all',
      subjectType: 'user',
      subjectId: req.user.sub,
      redactionMode: auditConfig.piiRedaction,
      metadata: {
        ...auditContext.metadata,
      },
    });
    return res.status(200).json({ revoked: true });
  } catch (err) {
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      actorUserId: req.user?.sub || null,
      eventType: 'refresh_tokens_revoke_all_failed',
      subjectType: 'user',
      subjectId: req.user?.sub || null,
      redactionMode: auditConfig.piiRedaction,
      metadata: {
        ...auditContext.metadata,
        reason: err?.code || 'UNKNOWN',
      },
    });
    return next(err);
  }
};

exports.verifyMfa = async (req, res, next) => {
  try {
    const result = await mfaService.verify({ userId: req.user.sub, code: req.body.code });
    const accessToken = tokenService.sign({
      sub: req.user.sub,
      email: req.user.email,
      role: req.user.role,
      mfaEnabled: true,
    });
    const refresh = await refreshTokenService.issue(req.user.sub);
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'mfa_verified',
      subjectType: 'user',
      subjectId: req.user.sub,
      metadata: {
        ...auditContext.metadata,
      },
    });
    return res.status(200).json({
      ...result,
      accessToken,
      refreshToken: refresh.refreshToken,
      tokenType: 'Bearer',
    });
  } catch (err) {
    if (err?.code === 'INVALID_MFA_CODE') {
      const auditContext = buildAuditContext(req);
      await safeAudit(auditService, {
        ...auditContext,
        eventType: 'mfa_verify_failed',
        subjectType: 'user',
        subjectId: req.user.sub,
        metadata: {
          ...auditContext.metadata,
          reason: err.code,
        },
      });
    }
    return next(err);
  }
};

exports.enrollMfa = async (req, res, next) => {
  try {
    const label = req.body?.label || req.user.email || 'StayHealthy';
    const result = await mfaService.enroll({
      userId: req.user.sub,
      label,
      issuer: env.JWT_ISSUER,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'mfa_enrolled',
      subjectType: 'user',
      subjectId: req.user.sub,
      metadata: {
        ...auditContext.metadata,
      },
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

exports.mfaStatus = async (req, res, next) => {
  try {
    const user = await usersRepository.findById(req.user.sub);
    if (!user) {
      return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
    }
    return res.status(200).json({
      configured: Boolean(user.mfa_secret),
      enabled: Boolean(user.mfa_enabled),
    });
  } catch (err) {
    return next(err);
  }
};

exports.disableMfa = async (req, res, next) => {
  try {
    await usersRepository.setMfaEnabled(req.user.sub, false);
    await usersRepository.setMfaSecret(req.user.sub, null);
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'mfa_disabled',
      subjectType: 'user',
      subjectId: req.user.sub,
      metadata: {
        ...auditContext.metadata,
      },
    });
    return res.status(200).json({ disabled: true });
  } catch (err) {
    return next(err);
  }
};
