const express = require('express');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');

const requestId = require('./middlewares/requestId');
const httpLogger = require('./middlewares/httpLogger');
const healthRoutes = require('./modules/health/health.routes');
const rateLimit = require('express-rate-limit');

const app = express();

// Rate limiter for SPA index file to mitigate DoS via excessive filesystem access
const spaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

// 1. Enable CORS (allows requests from Vite dev server)
app.use(cors()); 

// 2. Serve Static Files (Production Integration)
app.use(express.static(path.join(__dirname, '../../client/dist')));

app.use('/health', healthRoutes);
app.use('/api/v1', routes);
app.use(express.json());
app.use(requestId);

if (process.env.NODE_ENV !== 'test') {
  app.use(httpLogger);
}

app.use('/api/v1', routes);

// 3. Catch-all handler for React Router (SPA support)
app.get('*', spaLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

module.exports = app;
