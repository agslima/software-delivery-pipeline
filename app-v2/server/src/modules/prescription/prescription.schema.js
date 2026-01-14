const Joi = require('joi');

// Named export
exports.getPrescriptionSchema = Joi.object({
  id: Joi.string().pattern(/^[a-zA-Z0-9-]+$/).min(3).max(30).required()
});

