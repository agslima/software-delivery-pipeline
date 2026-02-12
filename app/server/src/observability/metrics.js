const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const authFailuresTotal = new client.Counter({
  name: 'auth_failures_total',
  help: 'Total authentication failures',
  labelNames: ['code'],
  registers: [register],
});

const registerAuthFailure = (code) => {
  authFailuresTotal.labels(code || 'UNKNOWN').inc();
};

module.exports = {
  register,
  httpRequestDuration,
  httpRequestTotal,
  registerAuthFailure,
};
