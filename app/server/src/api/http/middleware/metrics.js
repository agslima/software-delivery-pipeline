const env = require('../../../config/env');
const { httpRequestDuration, httpRequestTotal } = require('../../../observability/metrics');

const resolveRoute = (req) => {
  if (req.route && req.route.path) return req.route.path;
  if (req.baseUrl) return req.baseUrl;
  return req.path || 'unknown';
};

module.exports = function metrics(req, res, next) {
  if (!env.METRICS_ENABLED) return next();

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const seconds = Number(durationNs) / 1e9;
    const route = resolveRoute(req);
    const status = String(res.statusCode);

    httpRequestDuration.labels(req.method, route, status).observe(seconds);
    httpRequestTotal.labels(req.method, route, status).inc();
  });

  return next();
};
