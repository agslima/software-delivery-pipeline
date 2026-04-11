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

const readinessFailuresTotal = new client.Counter({
  name: 'readiness_failures_total',
  help: 'Total readiness check failures',
  labelNames: ['component'],
  registers: [register],
});

const workerPollErrorsTotal = new client.Counter({
  name: 'worker_poll_errors_total',
  help: 'Total worker poll loop errors',
  registers: [register],
});

const exportJobOutcomesTotal = new client.Counter({
  name: 'export_job_outcomes_total',
  help: 'Total processed export job outcomes',
  labelNames: ['outcome'],
  registers: [register],
});

const exportJobDepth = new client.Gauge({
  name: 'export_job_depth',
  help: 'Current export job depth by status',
  labelNames: ['status'],
  registers: [register],
});

const exportJobOldestQueuedAgeSeconds = new client.Gauge({
  name: 'export_job_oldest_queued_age_seconds',
  help: 'Age in seconds of the oldest queued export job',
  registers: [register],
});

const migrationRunDurationSeconds = new client.Histogram({
  name: 'migration_run_duration_seconds',
  help: 'Migration command duration in seconds',
  labelNames: ['command', 'status'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

const migrationRunFailuresTotal = new client.Counter({
  name: 'migration_run_failures_total',
  help: 'Total failed migration commands',
  labelNames: ['command'],
  registers: [register],
});

const registerAuthFailure = (code) => {
  authFailuresTotal.labels(code || 'UNKNOWN').inc();
};

const registerReadinessFailure = (component) => {
  readinessFailuresTotal.labels(component || 'unknown').inc();
};

const registerWorkerPollError = () => {
  workerPollErrorsTotal.inc();
};

const registerExportJobOutcome = (outcome) => {
  exportJobOutcomesTotal.labels(outcome || 'unknown').inc();
};

const updateExportJobDepth = ({ queued = 0, processing = 0, failed = 0, oldestQueuedAgeSeconds = 0 } = {}) => {
  exportJobDepth.labels('queued').set(queued);
  exportJobDepth.labels('processing').set(processing);
  exportJobDepth.labels('failed').set(failed);
  exportJobOldestQueuedAgeSeconds.set(oldestQueuedAgeSeconds);
};

const observeMigrationRun = ({ command, status, durationSeconds }) => {
  migrationRunDurationSeconds.labels(command || 'unknown', status || 'unknown').observe(durationSeconds);
};

const registerMigrationFailure = (command) => {
  migrationRunFailuresTotal.labels(command || 'unknown').inc();
};

module.exports = {
  register,
  httpRequestDuration,
  httpRequestTotal,
  registerAuthFailure,
  registerReadinessFailure,
  registerWorkerPollError,
  registerExportJobOutcome,
  updateExportJobDepth,
  observeMigrationRun,
  registerMigrationFailure,
};
