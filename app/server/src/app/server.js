const http = require('http');
const https = require('https');
const fs = require('fs');
const createApp = require('./createApp');
const env = require('../config/env');
const logger = require('../observability/logger');
const db = require('../infra/db/knex');

const app = createApp();
let server;

if (env.TLS_CERT_PATH && env.TLS_KEY_PATH) {
  const tlsOptions = {
    cert: fs.readFileSync(env.TLS_CERT_PATH),
    key: fs.readFileSync(env.TLS_KEY_PATH),
  };
  server = https.createServer(tlsOptions, app);
  logger.info({ tls: true }, 'TLS enabled for API server');
} else {
  server = http.createServer(app);
}

server.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutdown initiated');

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await db.destroy();
      logger.info('DB pool closed');
      process.exit(0);
    } catch (e) {
      logger.error({ err: e }, 'Failed to close DB pool');
      process.exit(1);
    }
  });

  // Force exit if hanging
  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 15000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
