const request = require('supertest');
const { buildTestPassword } = require('../helpers/testCredentials');

const baseEnv = { ...process.env };

const buildApp = () => {
  const createApp = require('../../src/app/createApp');
  return createApp();
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

    const res = await request(app).get('/metrics');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('http_requests_total');
  });

  it('rejects metrics without token when auth is configured', async () => {
    const metricsToken = buildTestPassword('metrics');
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_PATH = '/metrics';
    process.env.METRICS_AUTH_TOKEN = metricsToken;

    jest.resetModules();
    const app = buildApp();

    const res = await request(app).get('/metrics');

    expect(res.statusCode).toBe(401);
  });

  it('allows metrics with valid token when auth is configured', async () => {
    const metricsToken = buildTestPassword('metrics');
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_PATH = '/metrics';
    process.env.METRICS_AUTH_TOKEN = metricsToken;

    jest.resetModules();
    const app = buildApp();

    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${metricsToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('http_requests_total');
  });
});
