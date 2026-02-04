const Joi = require('joi');

const listAuditSchema = Joi.object({
  event_type: Joi.string().max(120),
  actor_user_id: Joi.string().guid({ version: 'uuidv4' }),
  subject_type: Joi.string().max(120),
  subject_id: Joi.string().guid({ version: 'uuidv4' }),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

module.exports = { listAuditSchema };
