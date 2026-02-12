const Joi = require('joi');

const doctorIdParamsSchema = Joi.object({
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

module.exports = { doctorIdParamsSchema };
