const express = require('express');
const controller = require('./auth.controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 login requests per windowMs
});

router.post('/login', loginLimiter, controller.login);

module.exports = router;
