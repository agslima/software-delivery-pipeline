const Joi = require('joi');

const patientIdParamsSchema = Joi.object({
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

const searchSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  dob: Joi.date().iso(),
  patient_id: Joi.string().guid({ version: 'uuidv4' }),
  limit: Joi.number().integer().min(1).max(100).default(25),
}).or('name', 'dob', 'patient_id');

module.exports = { patientIdParamsSchema, searchSchema };
