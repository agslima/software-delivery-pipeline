const router = require('express').Router();
const controller = require('./prescription.controller');

router.get('/:id', controller.getPrescription);

module.exports = router;
