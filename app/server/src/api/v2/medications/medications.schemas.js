const Joi = require('joi');

const medicationsSearchSchema = Joi.object({
  query: Joi.string().trim().min(2).max(120).required(),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = { medicationsSearchSchema };
