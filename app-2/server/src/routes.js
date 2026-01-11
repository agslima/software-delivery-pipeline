const router = require('express').Router();
const prescriptionRoutes = require('./modules/prescription/prescription.routes');

router.use('/v1/prescriptions', prescriptionRoutes);

module.exports = router;
