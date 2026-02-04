const express = require('express');
const auth = require('../../http/middleware/auth');
const requireRole = require('../../http/middleware/requireRole');
const validate = require('../../http/middleware/validate');
const controller = require('./doctors.controller');
const { doctorIdParamsSchema } = require('./doctors.schemas');
const { readLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.get('/me', readLimiter, auth, requireRole('doctor', 'admin'), controller.getMe);
router.get(
  '/:id',
  readLimiter,
  auth,
  requireRole('doctor', 'admin'),
  validate(doctorIdParamsSchema, 'params'),
  controller.getById
);

module.exports = router;
