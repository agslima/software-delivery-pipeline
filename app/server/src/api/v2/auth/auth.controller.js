const { PasswordAuthService } = require('../../../core/auth/passwordAuth.service');
const { LoginLockout } = require('../../../core/auth/loginLockout');
const { AuditService } = require('../../../core/v2/audit.service');
const { AuditRepository } = require('../../../infra/v2/audit.repository');
const { UsersRepository } = require('../../../infra/users/users.repository');
const tokenService = require('../../../infra/auth/jwtToken.service');
const env = require('../../../config/env');
const { buildAuditContext, safeAudit } = require('../audit/audit.helpers');

const lockout = new LoginLockout({
  maxFailures: env.LOGIN_MAX_FAILURES,
  lockoutMinutes: env.LOGIN_LOCK_MINUTES,
  windowMinutes: env.LOGIN_FAILURE_WINDOW_MINUTES,
});

const service = new PasswordAuthService({
  usersRepository: new UsersRepository(),
  tokenService,
  lockout,
});
const auditService = new AuditService({ auditRepository: new AuditRepository() });

exports.login = async (req, res, next) => {
  try {
    const payload = await service.login(req.body);
    return res.status(200).json(payload);
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
