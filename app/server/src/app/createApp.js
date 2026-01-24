const express = require('express');
const cors = require('cors');
const helmet = require('../config/helmet');
const env = require('../config/env');

const requestId = require('../api/http/middleware/requestId');
const httpLogger = require('../api/http/middleware/httpLogger');
const errorHandler = require('../api/http/errors/errorHandler');

const v1Routes = require('./routes');

module.exports = function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet);

  app.use(cors({
    origin: env.CORS_ORIGIN.split(',').map(s => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  }));

  app.use(express.json({ limit: '1mb' }));

  app.use(requestId);
  if (env.NODE_ENV !== 'test') app.use(httpLogger);

  app.use('/api/v1', v1Routes);

  app.use(errorHandler);
  return app;
};

