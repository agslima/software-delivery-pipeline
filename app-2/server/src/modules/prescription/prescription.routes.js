const express = require('express');
const controller = require('./prescription.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/:id',
  authMiddleware,
  controller.getPrescription
);

module.exports = router;
