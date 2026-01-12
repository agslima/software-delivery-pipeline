const express = require('express');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');

const requestId = require('./middlewares/request-id.middleware');
const httpLogger = require('./middlewares/http-logger.middleware');
const errorHandler = require('./middlewares/error-handler.middleware');

const healthRoutes = require('./modules/health/health.routes');

const app = express();

const rateLimit = require('express-rate-limit');

const spaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 SPA index requests per windowMs
});

// --- 1. Global Middleware ---
app.use(cors()); 
app.use(express.json());
app.use(requestId);

if (process.env.NODE_ENV !== 'test') {
  app.use(httpLogger);
}

// --- 2. Static Files (Frontend Integration) ---
// Serve the React build output
app.use(express.static(path.join(__dirname, '../../client/dist')));

// --- 3. Routes ---
app.use('/health', healthRoutes);

app.use('/api/v1', routes);

// --- 4. Catch-All (SPA Support) ---
app.get('*', spaRateLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

// --- 5. Error Handling ---
app.use(errorHandler);

module.exports = app;
