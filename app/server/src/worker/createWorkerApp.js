const express = require('express');

module.exports = function createWorkerApp(state) {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      ready: Boolean(state.ready),
      processedJobs: state.processedJobs,
      uptime: process.uptime(),
    });
  });

  app.get('/ready', (_req, res) => {
    if (!state.ready) {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'worker_not_ready',
      });
    }

    return res.json({
      status: 'ready',
      lastJobId: state.lastJobId,
      lastPollAt: state.lastPollAt,
    });
  });

  return app;
};
