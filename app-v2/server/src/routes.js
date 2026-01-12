const express = require('express');
const prescriptionRoutes = require('./modules/prescription/prescription.routes');
const authRoutes = require('./modules/auth/auth.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/prescriptions', prescriptionRoutes);

module.exports = router;
