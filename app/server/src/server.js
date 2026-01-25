const env = require('./config/env');

if (env.NODE_ENV === 'test') {
  const app = require('./app');
  const logger = require('./utils/logger');

  app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });
} else {
  require('./app/server');
}
