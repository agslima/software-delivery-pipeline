const Joi = require('joi');

const loginSchema = Joi.object({
  username: Joi.string().min(3).max(64).required(),
  password: Joi.string().min(6).max(128).required(),
});

module.exports = { loginSchema };
