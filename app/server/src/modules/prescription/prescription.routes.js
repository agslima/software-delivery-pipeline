const express = require('express');
const controller = require('./prescription.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { getPrescriptionSchema } = require('./prescription.schema');
const RateLimit = require('express-rate-limit');

const router = express.Router();

const getPrescriptionLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

router.get(
  '/:id',
  getPrescriptionLimiter,
  authMiddleware,
  validate(getPrescriptionSchema, 'params'),
  controller.getPrescription
);

module.exports = router;