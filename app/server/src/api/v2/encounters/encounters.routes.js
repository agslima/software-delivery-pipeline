const express = require('express');
const auth = require('../../http/middleware/auth');
const requireRole = require('../../http/middleware/requireRole');
const validate = require('../../http/middleware/validate');
const controller = require('./encounters.controller');
const { encounterIdParamsSchema, createEncounterSchema, updateEncounterSchema } = require('./encounters.schemas');
const { writeLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.post('/', writeLimiter, auth, requireRole('doctor'), validate(createEncounterSchema), controller.create);
router.patch(
  '/:id',
  writeLimiter,
  auth,
  requireRole('doctor'),
  validate(encounterIdParamsSchema, 'params'),
  validate(updateEncounterSchema),
  controller.updateStatus
);

module.exports = router;
