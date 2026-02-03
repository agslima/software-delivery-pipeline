const logger = require('../../../observability/logger');

const buildAuditContext = (req) => ({
  actorUserId: req.user?.sub,
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || null,
  metadata: {
    requestId: req.id,
  },
});

const safeAudit = async (auditService, event) => {
  try {
    await auditService.logEvent(event);
  } catch (err) {
    logger.warn({ err }, 'Audit log failed');
  }
};

module.exports = { buildAuditContext, safeAudit };
