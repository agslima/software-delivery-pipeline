const createWorkerApp = require('../../src/worker/createWorkerApp');

const getRouteHandler = (app, path) => {
  const router = app.router || app._router;
  const layer = router.stack.find((entry) => entry.route?.path === path);
  return layer.route.stack[0].handle;
};

const createMockResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('Unit: worker app', () => {
  it('reports readiness failure until the worker loop is ready', async () => {
    const app = createWorkerApp({
      ready: false,
      processedJobs: 0,
      lastJobId: null,
      lastPollAt: null,
      lastError: 'db unavailable',
    });
    const res = createMockResponse();
    const handler = getRouteHandler(app, '/ready');

    await handler({}, res);

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
    });
    const health = createMockResponse();
    const ready = createMockResponse();
    const healthHandler = getRouteHandler(app, '/health');
    const readyHandler = getRouteHandler(app, '/ready');

    await healthHandler({}, health);
    await readyHandler({}, ready);

    expect(health.statusCode).toBe(200);
    expect(health.body).toEqual({
      status: 'ok',
      ready: true,
      processedJobs: 4,
      uptime: expect.any(Number),
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.body).toEqual({
      status: 'ready',
      lastJobId: 'job-1',
      lastPollAt: '2026-04-11T12:00:00.000Z',
    });
  });
});
