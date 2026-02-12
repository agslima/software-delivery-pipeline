const { randomUUID } = require('crypto');
const auditConfig = require('../../config/audit');

class AuditService {
  constructor({ auditRepository }) {
    this.auditRepository = auditRepository;
  }

  async logEvent({ actorUserId, eventType, subjectType, subjectId, ipAddress, userAgent, metadata, redactionMode }) {
    if (!auditConfig.enabled) return null;
    const event = {
      id: randomUUID(),
      actor_user_id: actorUserId,
      event_type: eventType,
      subject_type: subjectType,
      subject_id: subjectId,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      metadata: metadata || null,
      redaction_mode: redactionMode || auditConfig.piiRedaction || 'none',
      created_at: new Date(),
    };

    await this.auditRepository.create(event);
    return event;
  }

  async listEvents(filters) {
    return this.auditRepository.list(filters);
  }
}

module.exports = { AuditService };
