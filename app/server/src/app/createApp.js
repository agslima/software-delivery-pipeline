const express = require('express');
const cors = require('cors');
const helmet = require('../config/helmet');
const env = require('../config/env');
const corsOptions = require('../config/cors');

const requestId = require('../api/http/middleware/requestId');
const requireTls = require('../api/http/middleware/requireTls');
const metrics = require('../api/http/middleware/metrics');
const httpLogger = require('../api/http/middleware/httpLogger');
const errorHandler = require('../api/http/errors/errorHandler');
const { AppError } = require('../api/http/errors/AppError');
const metricsRoutes = require('../api/http/routes/metrics.routes');

const v1Routes = require('./routes');
const v2Routes = require('./routesV2');

/**
 * Normalize TRUST_PROXY configuration into the shape Express expects.
 *
 * @param {string|number|boolean|undefined|null} value - Raw trust proxy configuration.
 * @returns {string|number|boolean} Parsed trust proxy setting.
 */
const parseTrustProxy = (value) => {
  if (!value) return 'loopback, linklocal, uniquelocal';
  const normalized = String(value).trim();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return normalized;
};

/**
 * Build and configure the Express application with security middleware and routes.
 *
 * @returns {import('express').Express} Configured Express application.
 */
module.exports = function createApp() {
  const app = express();

  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.disable('etag');

  app.use(helmet);

  app.use(cors(corsOptions));

  app.use(express.json({ limit: '1mb' }));

  app.use(requestId);
  app.use(metrics);
  app.use(requireTls);
  if (env.NODE_ENV !== 'test') app.use(httpLogger);

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    return next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(metricsRoutes);

  app.use('/api/v1', v1Routes);
  app.use('/api/v2', v2Routes);

  app.use((req, _res, next) => {
    next(
      new AppError({
        status: 404,
        code: 'ROUTE_NOT_FOUND',
        message: `Route not found: ${req.method} ${req.originalUrl}`,
      })
    );
  });

  app.use(errorHandler);
  return app;
};
