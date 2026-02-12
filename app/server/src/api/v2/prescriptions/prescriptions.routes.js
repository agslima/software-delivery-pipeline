const express = require('express');
const auth = require('../../http/middleware/auth');
const requireRole = require('../../http/middleware/requireRole');
const validate = require('../../http/middleware/validate');
const controller = require('./prescriptions.controller');
const {
  prescriptionIdParamsSchema,
  createPrescriptionSchema,
  updatePrescriptionSchema,
} = require('./prescriptions.schemas');
const { readLimiter, writeLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.post('/', writeLimiter, auth, requireRole('doctor'), validate(createPrescriptionSchema), controller.create);
router.get('/:id', readLimiter, auth, requireRole('doctor'), validate(prescriptionIdParamsSchema, 'params'), controller.getById);
router.patch(
  '/:id',
  writeLimiter,
  auth,
  requireRole('doctor'),
  validate(prescriptionIdParamsSchema, 'params'),
  validate(updatePrescriptionSchema),
  controller.update
);

module.exports = router;
