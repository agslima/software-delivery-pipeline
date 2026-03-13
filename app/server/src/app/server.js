const http = require('http');
const https = require('https');
const fs = require('fs');
const createApp = require('./createApp');
const env = require('../config/env');
const logger = require('../observability/logger');
const db = require('../infra/db/knex');

const app = createApp();

/**
 * Create the HTTP or HTTPS server for the API process based on TLS config.
 *
 * @returns {import('http').Server|import('https').Server} Configured server instance.
 */
const createServer = () => {
  const hasTlsCert = Boolean(env.TLS_CERT_PATH);
  const hasTlsKey = Boolean(env.TLS_KEY_PATH);

  if (!hasTlsCert && !hasTlsKey) {
    logger.info({ tls: false }, 'TLS listener not configured; starting HTTP server');
    return http.createServer(app);
  }

  if (!hasTlsCert || !hasTlsKey) {
    logger.error('TLS_CERT_PATH and TLS_KEY_PATH must both be set to enable HTTPS.');
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

/**
 * Gracefully stop accepting requests and close process resources.
 *
 * @param {string} signal - Process signal that triggered shutdown.
 * @returns {Promise<void>} Resolves when shutdown work has been scheduled.
 */
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
