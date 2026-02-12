const express = require('express');
const auth = require('../../http/middleware/auth');
const requireRole = require('../../http/middleware/requireRole');
const validate = require('../../http/middleware/validate');
const controller = require('./medications.controller');
const { medicationsSearchSchema } = require('./medications.schemas');
const { readLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.get('/', readLimiter, auth, requireRole('doctor'), validate(medicationsSearchSchema, 'query'), controller.search);

module.exports = router;
