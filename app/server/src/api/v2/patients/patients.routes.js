const express = require('express');
const auth = require('../../http/middleware/auth');
const requireRole = require('../../http/middleware/requireRole');
const validate = require('../../http/middleware/validate');
const controller = require('./patients.controller');
const { patientIdParamsSchema, searchSchema } = require('./patients.schemas');
const { readLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.get('/search', readLimiter, auth, requireRole('doctor'), validate(searchSchema, 'query'), controller.search);
router.get('/:id', readLimiter, auth, requireRole('doctor'), validate(patientIdParamsSchema, 'params'), controller.getPatient);
router.get(
  '/:id/summary',
  readLimiter,
  auth,
  requireRole('doctor'),
  validate(patientIdParamsSchema, 'params'),
  controller.getSummary
);
router.get(
  '/:id/prescriptions',
  readLimiter,
  auth,
  requireRole('doctor'),
  validate(patientIdParamsSchema, 'params'),
  controller.getPrescriptions
);

module.exports = router;
