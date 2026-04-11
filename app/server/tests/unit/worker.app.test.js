const createWorkerApp = require('../../src/worker/createWorkerApp');

const getRouteHandlers = (app, path) => {
  const router = app.router || app._router;
  const layer = router.stack.find((entry) => entry.route?.path === path);
  return layer.route.stack.map((entry) => entry.handle);
};

const runRoute = async (app, path, req = {}) => {
  const handlers = getRouteHandlers(app, path);
  const res = createMockResponse();

  let index = 0;
  const next = async (err) => {
    if (err) throw err;
    const handler = handlers[index];
    index += 1;
    if (handler) {
      await handler(req, res, next);
    }
  };

  await next();
  return res;
};

const createMockResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('Unit: worker app', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in baseEnv)) delete process.env[key];
    });
    Object.assign(process.env, baseEnv);
    jest.resetModules();
  });

  it('reports readiness failure until the worker loop is ready', async () => {
    const app = createWorkerApp({
      ready: false,
      processedJobs: 0,
      lastJobId: null,
      lastPollAt: null,
      lastError: 'db unavailable',
      queueDepth: 0,
      failedJobs: 0,
      oldestQueuedAgeSeconds: 0,
    });
    const res = await runRoute(app, '/ready');

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      status: 'not_ready',
      lastError: 'db unavailable',
    });
  });

  it('reports health and readiness details once the worker is running', async () => {
    const app = createWorkerApp({
      ready: true,
      processedJobs: 4,
      lastJobId: 'job-1',
      lastPollAt: '2026-04-11T12:00:00.000Z',
      lastError: null,
      queueDepth: 2,
      failedJobs: 1,
      oldestQueuedAgeSeconds: 9,
    });
    const health = await runRoute(app, '/health');
    const ready = await runRoute(app, '/ready');

    expect(health.statusCode).toBe(200);
    expect(health.body).toEqual({
      status: 'ok',
      ready: true,
      processedJobs: 4,
      queueDepth: 2,
      failedJobs: 1,
      oldestQueuedAgeSeconds: 9,
      uptime: expect.any(Number),
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.body).toEqual({
      status: 'ready',
      lastJobId: 'job-1',
      lastPollAt: '2026-04-11T12:00:00.000Z',
      queueDepth: 2,
      failedJobs: 1,
    });
  });

  it('exposes worker metrics when enabled', async () => {
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_PATH = '/metrics';
    process.env.METRICS_AUTH_TOKEN = '';

    jest.resetModules();
    const buildWorkerApp = require('../../src/worker/createWorkerApp');
    const app = buildWorkerApp({
      ready: true,
      processedJobs: 1,
      lastJobId: 'job-1',
      lastPollAt: '2026-04-11T12:00:00.000Z',
      lastError: null,
      queueDepth: 1,
      failedJobs: 0,
      oldestQueuedAgeSeconds: 0,
    });
    const res = await runRoute(app, '/metrics', { header: () => undefined });

    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('worker_poll_errors_total');
    expect(String(res.body)).toContain('export_job_depth');
  });
});
