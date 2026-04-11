const express = require('express');
const env = require('../config/env');
const metricsAuth = require('../api/http/middleware/metricsAuth');
const { register, registerReadinessFailure } = require('../observability/metrics');

module.exports = function createWorkerApp(state) {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      ready: Boolean(state.ready),
      processedJobs: state.processedJobs,
      queueDepth: state.queueDepth,
      failedJobs: state.failedJobs,
      oldestQueuedAgeSeconds: state.oldestQueuedAgeSeconds,
      uptime: process.uptime(),
    });
  });

  app.get('/ready', (_req, res) => {
    if (!state.ready) {
      registerReadinessFailure('worker');
      return res.status(503).json({
        status: 'not_ready',
        lastError: state.lastError,
      });
    }

    return res.json({
      status: 'ready',
      lastJobId: state.lastJobId,
      lastPollAt: state.lastPollAt,
      queueDepth: state.queueDepth,
      failedJobs: state.failedJobs,
    });
  });

  if (env.METRICS_ENABLED) {
    app.get(env.METRICS_PATH, metricsAuth, async (_req, res, next) => {
      try {
        res.setHeader('Content-Type', register.contentType);
        const output = await register.metrics();
        return res.status(200).send(output);
      } catch (error) {
        return next(error);
      }
    });
  }

  return app;
};
