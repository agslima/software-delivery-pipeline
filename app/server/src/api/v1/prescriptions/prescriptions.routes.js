const express = require('express');
const controller = require('./prescriptions.controller');
const auth = require('../../http/middleware/auth');
const validate = require('../../http/middleware/validate');
const { getPrescriptionParamsSchema } = require('./prescriptions.schemas');
const { readLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.get(
  '/:id',
  readLimiter,
  auth,
  validate(getPrescriptionParamsSchema, 'params'),
  controller.getPrescription
);

module.exports = router;
