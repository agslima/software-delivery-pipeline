const http = require('http');
const https = require('https');
const fs = require('fs');
const createApp = require('./createApp');
const env = require('../config/env');
const logger = require('../observability/logger');
const db = require('../infra/db/knex');

const app = createApp();

const shouldUseTls = env.ENFORCE_TLS || (env.TLS_CERT_PATH && env.TLS_KEY_PATH);

const createServer = () => {
  if (!shouldUseTls) {
    logger.info({ tls: false }, 'TLS not configured; starting HTTP server');
    return http.createServer(app);
  }

  if (!env.TLS_CERT_PATH || !env.TLS_KEY_PATH) {
    logger.error('TLS_CERT_PATH and TLS_KEY_PATH must be set when TLS is enforced.');
    process.exit(1);
  }

  const tlsOptions = {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    cert: fs.readFileSync(env.TLS_CERT_PATH),
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    key: fs.readFileSync(env.TLS_KEY_PATH),
    minVersion: 'TLSv1.2',
  };

  logger.info({ tls: true }, 'TLS enabled for API server');
  return https.createServer(tlsOptions, app);
};

const server = createServer();

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
