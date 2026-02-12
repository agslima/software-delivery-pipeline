const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(254)
    .trim()
    .lowercase()
    .required(),
  password: Joi.string().min(8).max(128).required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().min(32).required(),
});

const revokeSchema = Joi.object({
  refreshToken: Joi.string().min(32).required(),
});

const mfaVerifySchema = Joi.object({
  code: Joi.string().pattern(/^\d{6}$/).required(),
});

const mfaEnrollSchema = Joi.object({
  label: Joi.string().max(128).optional(),
});

module.exports = { loginSchema, refreshSchema, revokeSchema, mfaVerifySchema, mfaEnrollSchema };
