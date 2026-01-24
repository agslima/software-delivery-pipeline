const express = require('express');
const db = require('../../../infra/db/knex');

const router = express.Router();

router.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

router.get('/readyz', async (_req, res, next) => {
  try {
    await db.raw('select 1');
    res.json({ status: 'ready' });
  } catch (err) {
    err.status = 503;
    err.code = 'NOT_READY';
    next(err);
  }
});

module.exports = router;

