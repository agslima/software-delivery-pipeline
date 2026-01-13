const express = require('express');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const env = require('./config/env'); // Import env config

// Middlewares
const requestId = require('./middlewares/request-id.middleware');
const httpLogger = require('./middlewares/http-logger.middleware');
const errorHandler = require('./middlewares/error-handler.middleware');

// Health Check
const healthRoutes = require('./modules/health/health.routes');
const rateLimit = require('express-rate-limit');

const app = express();

const clientDistPath = path.join(__dirname, env.CLIENT_DIST_PATH);

// Rate limiter for SPA catch-all route
const spaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs for SPA index
});

// 1. Global Middleware
app.use(cors());
app.use(express.json());
app.use(requestId);

if (process.env.NODE_ENV !== 'test') {
  app.use(httpLogger);
}

// 2. Static Files (Frontend Integration)
// Use the variable we defined above
app.use(express.static(clientDistPath));

// 3. Documentation & Health
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/health', healthRoutes);

// 4. API Routes
app.use('/api/v1', routes);

// 5. Catch-All (SPA Support)
app.get('*', spaLimiter, (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// 6. Error Handler
app.use(errorHandler);

module.exports = app;
