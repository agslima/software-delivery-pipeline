const express = require('express');

// Import Modules
const prescriptionRoutes = require('./modules/prescription/prescription.routes');
const authRoutes = require('./modules/auth/auth.routes');

const router = express.Router();

// Mount Routes
router.use('/auth', authRoutes);
router.use('/prescriptions', prescriptionRoutes);

module.exports = router;