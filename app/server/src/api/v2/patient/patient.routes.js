const express = require('express');
const auth = require('../../http/middleware/auth');
const requireRole = require('../../http/middleware/requireRole');
const validate = require('../../http/middleware/validate');
const controller = require('./patient.controller');
const { prescriptionIdParamsSchema } = require('./patient.schemas');
const { readLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.get('/me/prescriptions', readLimiter, auth, requireRole('patient'), controller.listPrescriptions);
router.get(
  '/me/prescriptions/:id',
  readLimiter,
  auth,
  requireRole('patient'),
  validate(prescriptionIdParamsSchema, 'params'),
  controller.getPrescription
);

module.exports = router;
