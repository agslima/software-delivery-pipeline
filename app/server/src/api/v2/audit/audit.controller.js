const { AuditService } = require('../../../core/v2/audit.service');
const { AuditRepository } = require('../../../infra/v2/audit.repository');

const service = new AuditService({
  auditRepository: new AuditRepository(),
});

const mapEvent = (row) => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  eventType: row.event_type,
  subjectType: row.subject_type,
  subjectId: row.subject_id,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  metadata: row.metadata,
  createdAt: row.created_at,
});

exports.listEvents = async (req, res, next) => {
  try {
    const events = await service.listEvents({
      eventType: req.query.event_type,
      actorUserId: req.query.actor_user_id,
      subjectType: req.query.subject_type,
      subjectId: req.query.subject_id,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      offset: req.query.offset === undefined ? undefined : Number(req.query.offset),
    });

    return res.json({ events: events.map(mapEvent) });
  } catch (err) {
    return next(err);
  }
};
