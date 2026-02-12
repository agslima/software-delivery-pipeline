const logger = require('../../../observability/logger');
const auditConfig = require('../../../config/audit');

const buildAuditContext = (req) => ({
  actorUserId: req.user?.sub,
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || null,
  metadata: {
    requestId: req.id,
  },
});

const sanitizeMetadata = (metadata = {}, mode = 'none') => {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const clone = { ...metadata };
  const keys = ['refreshToken', 'token', 'password', 'mfaCode', 'secrets'];
  keys.forEach((key) => {
    if (key in clone) clone[key] = '[REDACTED]';
  });
  if (mode === 'strict') {
    Object.keys(clone).forEach((key) => {
      if (clone[key] && typeof clone[key] === 'object') {
        clone[key] = '[REDACTED]';
      }
    });
  }
  return clone;
};

const safeAudit = async (auditService, event) => {
  try {
    const payload = { ...event };
    const redactionMode = event.redactionMode || auditConfig.piiRedaction;
    payload.metadata = sanitizeMetadata(event.metadata, redactionMode);
    payload.redactionMode = redactionMode;
    await auditService.logEvent(payload);
  } catch (err) {
    logger.warn({ err }, 'Audit log failed');
  }
};

module.exports = { buildAuditContext, safeAudit, sanitizeMetadata };
