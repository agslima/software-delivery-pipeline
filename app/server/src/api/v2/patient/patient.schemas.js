const Joi = require('joi');

const prescriptionIdParamsSchema = Joi.object({
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

module.exports = { prescriptionIdParamsSchema };
