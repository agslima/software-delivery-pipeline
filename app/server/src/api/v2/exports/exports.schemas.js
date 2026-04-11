const Joi = require('joi');

const exportJobIdParamsSchema = Joi.object({
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

module.exports = { exportJobIdParamsSchema };
