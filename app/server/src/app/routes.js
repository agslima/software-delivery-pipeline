const express = require('express');

const healthRoutes = require('../api/v1/health/health.routes');
const authRoutes = require('../api/v1/auth/auth.routes');
const prescriptionsRoutes = require('../api/v1/prescriptions/prescriptions.routes');

const router = express.Router();

router.use(healthRoutes);
router.use('/auth', authRoutes);
router.use('/prescriptions', prescriptionsRoutes);

module.exports = router;
