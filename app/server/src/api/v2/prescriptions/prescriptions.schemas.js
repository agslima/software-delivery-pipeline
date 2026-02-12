const Joi = require('joi');

const prescriptionIdParamsSchema = Joi.object({
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

const itemSchema = Joi.object({
  medicationId: Joi.string().guid({ version: 'uuidv4' }).required(),
  dose: Joi.string().max(64).allow('', null),
  route: Joi.string().max(64).allow('', null),
  frequency: Joi.string().max(64).allow('', null),
  duration: Joi.string().max(64).allow('', null),
  quantity: Joi.string().max(64).allow('', null),
  instructions: Joi.string().max(256).allow('', null),
});

const createPrescriptionSchema = Joi.object({
  patientId: Joi.string().guid({ version: 'uuidv4' }).required(),
  encounterId: Joi.string().guid({ version: 'uuidv4' }).optional(),
  expiresAt: Joi.date().iso().optional(),
  notes: Joi.string().max(500).allow('', null),
  items: Joi.array().min(1).items(itemSchema).required(),
});

const updatePrescriptionSchema = Joi.object({
  status: Joi.string().valid('active', 'completed', 'cancelled'),
  expiresAt: Joi.date().iso().allow(null),
  notes: Joi.string().max(500).allow('', null),
}).min(1);

module.exports = { prescriptionIdParamsSchema, createPrescriptionSchema, updatePrescriptionSchema };
