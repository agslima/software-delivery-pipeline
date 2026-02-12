const express = require('express');
const auth = require('../../http/middleware/auth');
const requireRole = require('../../http/middleware/requireRole');
const validate = require('../../http/middleware/validate');
const controller = require('./audit.controller');
const { listAuditSchema } = require('./audit.schemas');
const { readLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.get('/events', readLimiter, auth, requireRole('admin'), validate(listAuditSchema, 'query'), controller.listEvents);

module.exports = router;
