const express = require('express');
const env = require('../../../config/env');
const metricsAuth = require('../middleware/metricsAuth');
const { register } = require('../../../observability/metrics');

const router = express.Router();

router.get(env.METRICS_PATH, metricsAuth, async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    const output = await register.metrics();
    return res.status(200).send(output);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
