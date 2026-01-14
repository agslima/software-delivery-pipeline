const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const env = require('./config/env');

const requestId = require('./middlewares/request-id.middleware');
const httpLogger = require('./middlewares/http-logger.middleware');
const errorHandler = require('./middlewares/error-handler.middleware');
const healthRoutes = require('./modules/health/health.routes');
const rateLimit = require('express-rate-limit');

const app = express();

const clientDistPath = path.join(__dirname, env.CLIENT_DIST_PATH);

const spaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
});

// Trust Proxy (Required for Docker/Rate Limiting)
app.set('trust proxy', 1);

// Helmet
app.use(helmet()); 
app.disable('x-powered-by');

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowedOrigins = env.CORS_ORIGIN.split(',');

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`Blocked by CORS: ${origin}`); 
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(requestId);

if (process.env.NODE_ENV !== 'test') {
  app.use(httpLogger);
}

// 2. Static Files (Frontend Integration)
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