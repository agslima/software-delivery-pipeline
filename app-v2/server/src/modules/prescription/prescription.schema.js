const Joi = require('joi');

// Schema for validating URL parameters (e.g. /:id)
exports.getPrescriptionSchema = Joi.object({
  id: Joi.string().alphanum().min(3).max(30).required()
});

module.exports = Joi.object({
  id: Joi.string().required(),
  clinicName: Joi.string().required(),
  date: Joi.string().required(),
  doctor: Joi.object({
    name: Joi.string().required(),
    license: Joi.string().required(),
  }),
  patient: Joi.object({
    name: Joi.string().required(),
    dob: Joi.string().required(),
  }),
  medications: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      dosage: Joi.string().required(),
      directions: Joi.string().required(),
      quantity: Joi.string().required(),
    })
  ),
});
