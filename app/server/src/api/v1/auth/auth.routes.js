const express = require('express');
const controller = require('./auth.controller');
const validate = require('../../http/middleware/validate');
const { loginSchema } = require('./auth.schemas');
const { loginLimiter } = require('../../http/middleware/rateLimiters');

const router = express.Router();

router.post('/login', loginLimiter, validate(loginSchema), controller.login);

module.exports = router;
