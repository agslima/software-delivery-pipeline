const express = require('express');
const auth = require('../../http/middleware/auth');
const requireRole = require('../../http/middleware/requireRole');
const validate = require('../../http/middleware/validate');
const controller = require('./exports.controller');
const { exportJobIdParamsSchema } = require('./exports.schemas');
const { readLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.get('/:id', readLimiter, auth, requireRole('doctor'), validate(exportJobIdParamsSchema, 'params'), controller.getById);

module.exports = router;
