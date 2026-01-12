const express = require('express');
const controller = require('./prescription.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware'); // Import Generic Validator
const { getPrescriptionSchema } = require('./prescription.schema'); // Import Specific Schema
const RateLimit = require('express-rate-limit');

const router = express.Router();

const getPrescriptionLimiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for this route
});

router.get(
  '/:id',
  getPrescriptionLimiter,
  authMiddleware,
  validate(getPrescriptionSchema, 'params'),
  controller.getPrescription
);

module.exports = router;
