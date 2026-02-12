const db = require('../db/knex');

class AuditRepository {
  async create(event) {
    await db.withSchema('v2').from('audit_events').insert(event);
  }

  async list({ eventType, actorUserId, subjectType, subjectId, limit = 50, offset = 0 }) {
    const query = db
      .withSchema('v2').from('audit_events')
      .select(
        'id',
        'actor_user_id',
        'event_type',
        'subject_type',
        'subject_id',
        'ip_address',
        'user_agent',
        'redaction_mode',
        'metadata',
        'created_at'
      )
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (eventType) query.where('event_type', eventType);
    if (actorUserId) query.where('actor_user_id', actorUserId);
    if (subjectType) query.where('subject_type', subjectType);
    if (subjectId) query.where('subject_id', subjectId);

    return query;
  }
}

module.exports = { AuditRepository };
