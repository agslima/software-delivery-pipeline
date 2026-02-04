const express = require('express');

const authRoutes = require('../api/v2/auth/auth.routes');
const doctorsRoutes = require('../api/v2/doctors/doctors.routes');
const patientsRoutes = require('../api/v2/patients/patients.routes');
const encountersRoutes = require('../api/v2/encounters/encounters.routes');
const prescriptionsRoutes = require('../api/v2/prescriptions/prescriptions.routes');
const medicationsRoutes = require('../api/v2/medications/medications.routes');
const patientRoutes = require('../api/v2/patient/patient.routes');
const auditRoutes = require('../api/v2/audit/audit.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/doctors', doctorsRoutes);
router.use('/patients', patientsRoutes);
router.use('/encounters', encountersRoutes);
router.use('/prescriptions', prescriptionsRoutes);
router.use('/medications', medicationsRoutes);
router.use('/patient', patientRoutes);
router.use('/audit', auditRoutes);

module.exports = router;
