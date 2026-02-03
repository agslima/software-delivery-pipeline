const Joi = require('joi');

const getPrescriptionParamsSchema = Joi.object({
  id: Joi.string().pattern(/^[a-zA-Z0-9-]+$/).min(3).max(30).required(),
});

module.exports = { getPrescriptionParamsSchema };
