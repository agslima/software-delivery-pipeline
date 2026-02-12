const express = require('express');
const db = require('../../../infra/db/knex');
const { AppError } = require('../../http/errors/AppError');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const readyzLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per windowMs
});

router.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

router.get('/readyz', readyzLimiter, async (_req, res, next) => {
  try {
    await db.raw('select 1');
    res.json({ status: 'ready' });
  } catch {
    next(new AppError({ status: 503, code: 'NOT_READY', message: 'Not ready' }));
  }
});

module.exports = router;
