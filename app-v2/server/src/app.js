const express = require('express');
const routes = require('./routes');

const requestId = require('./middlewares/requestId');
const httpLogger = require('./middlewares/httpLogger');

const healthRoutes = require('./modules/health/health.routes');

const app = express();

app.use('/health', healthRoutes);      // ✅ direct
app.use('/api/v1', routes);            // versioned API
app.use(express.json());
app.use(requestId);

if (process.env.NODE_ENV !== 'test') {
  app.use(httpLogger);
}

app.use('/api/v1', routes);

module.exports = app;
