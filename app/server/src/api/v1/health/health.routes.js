const express = require('express');
const db = require('../../../infra/db/knex');
const { AppError } = require('../../http/errors/AppError');

const router = express.Router();

router.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

router.get('/readyz', async (_req, res, next) => {
  try {
    await db.raw('select 1');
    res.json({ status: 'ready' });
  } catch {
    next(new AppError({ status: 503, code: 'NOT_READY', message: 'Not ready' }));
  }
});

module.exports = router;
