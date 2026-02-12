const Joi = require('joi');

const encounterIdParamsSchema = Joi.object({
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

const createEncounterSchema = Joi.object({
  patientId: Joi.string().guid({ version: 'uuidv4' }).required(),
  facilityId: Joi.string().guid({ version: 'uuidv4' }).optional(),
});

const updateEncounterSchema = Joi.object({
  status: Joi.string().valid('open', 'closed').required(),
});

module.exports = { encounterIdParamsSchema, createEncounterSchema, updateEncounterSchema };
