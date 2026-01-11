const express = require('express');
const prescriptionRoutes = require('./modules/prescription/prescription.routes');
const authRoutes = require('./modules/auth/auth.routes');
const healthRoutes = require('./modules/health/health.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/health', healthRoutes);

module.exports = router;
