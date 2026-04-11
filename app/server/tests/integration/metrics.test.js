const { buildTestPassword } = require('../helpers/testCredentials');

const baseEnv = { ...process.env };

const buildApp = () => {
  const createApp = require('../../src/app/createApp');
  return createApp();
};

const findRouteLayer = (stack, path) => {
  for (const entry of stack) {
    if (entry.route?.path === path) {
      return entry;
    }
    if (entry.handle?.stack) {
      const nested = findRouteLayer(entry.handle.stack, path);
      if (nested) return nested;
    }
  }
  return null;
};

const getRouteHandlers = (app, path) => {
  const router = app.router || app._router;
  const layer = findRouteLayer(router.stack, path);
  if (!layer) {
    throw new Error(`Route not found for path ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle);
};

const createMockResponse = () => ({
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
  send(payload) {
    this.body = payload;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

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

describe('Integration: Metrics endpoint', () => {
  afterAll(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in baseEnv)) delete process.env[key];
    });
    Object.assign(process.env, baseEnv);
  });

  it('exposes metrics when enabled', async () => {
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_PATH = '/metrics';
    process.env.METRICS_AUTH_TOKEN = '';

    jest.resetModules();
    const app = buildApp();

    const res = await runRoute(app, '/metrics', { header: () => undefined });

    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('http_requests_total');
  });

  it('rejects metrics without token when auth is configured', async () => {
    const metricsToken = buildTestPassword('metrics');
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_PATH = '/metrics';
    process.env.METRICS_AUTH_TOKEN = metricsToken;

    jest.resetModules();
    const app = buildApp();

    await expect(runRoute(app, '/metrics', { header: () => undefined })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('allows metrics with valid token when auth is configured', async () => {
    const metricsToken = buildTestPassword('metrics');
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_PATH = '/metrics';
    process.env.METRICS_AUTH_TOKEN = metricsToken;

    jest.resetModules();
    const app = buildApp();

    const res = await runRoute(app, '/metrics', {
      header(name) {
        return name.toLowerCase() === 'authorization' ? `Bearer ${metricsToken}` : undefined;
      },
    });

    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('http_requests_total');
  });
});
