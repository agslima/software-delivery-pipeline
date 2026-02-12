const express = require('express');
const controller = require('./auth.controller');
const validate = require('../../http/middleware/validate');
const { loginSchema, refreshSchema, revokeSchema, mfaVerifySchema, mfaEnrollSchema } = require('./auth.schemas');
const { loginLimiter, refreshLimiter, mfaLimiter } = require('../../http/middleware/rateLimiters');
const auth = require('../../http/middleware/auth');
const mfaAuth = require('../../http/middleware/mfaAuth');

const router = express.Router();

router.post('/login', loginLimiter, validate(loginSchema), controller.login);
router.post('/refresh', refreshLimiter, validate(refreshSchema), controller.refresh);
router.post('/logout', refreshLimiter, validate(revokeSchema), controller.revoke);
router.post('/logout/all', refreshLimiter, auth, controller.revokeAll);
router.post('/mfa/verify', mfaLimiter, mfaAuth, validate(mfaVerifySchema), controller.verifyMfa);
router.post('/mfa/enroll', mfaLimiter, auth, validate(mfaEnrollSchema), controller.enrollMfa);
router.get('/mfa/status', mfaLimiter, auth, controller.mfaStatus);
router.post('/mfa/disable', mfaLimiter, auth, controller.disableMfa);

module.exports = router;
