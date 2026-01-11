const express = require('express');
const helmet = require('./config/helmet');
const rateLimit = require('./config/rateLimit');
const apiRoutes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const requestId = require('./middlewares/requestId');
const httpLogger = require('./middlewares/httpLogger');
const healthRoutes = require('./routes/health.routes');

const app = express();

const path = require('path');

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use(requestId);
app.use(httpLogger);
app.use(express.json());
app.use(helmet);

app.use('/health', healthRoutes);
app.use('/api', rateLimit, apiRoutes);

app.use(errorHandler);

module.exports = app;
