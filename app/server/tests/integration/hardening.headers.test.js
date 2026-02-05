const request = require('supertest');

const buildApp = () => {
  const createApp = require('../../src/app/createApp');
  return createApp();
};

describe('Integration: Hardening headers', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
  });

  it('sets no-store cache headers on API routes', async () => {
    const res = await request(app).get('/api/v1/healthz');

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.pragma).toBe('no-cache');
  });

  it('disables ETag and X-Powered-By on API routes', async () => {
    const res = await request(app).get('/api/v1/healthz');

    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBeUndefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets a content security policy header', async () => {
    const res = await request(app).get('/api/v1/healthz');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('Integration: HSTS in production', () => {
  const baseEnv = { ...process.env };
  let app;

  beforeAll(() => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASS = 'test_password';
    process.env.JWT_SECRET = 'test_secret_key';
    process.env.LOG_LEVEL = 'silent';
    process.env.CORS_ORIGIN = 'http://localhost';
    process.env.DB_HOST = 'localhost';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASS = 'test_pass';
    process.env.DB_NAME = 'test_db';
    process.env.DATA_ENCRYPTION_KEY = 'test-data-encryption-key';

    jest.resetModules();
    app = buildApp();
  });

  afterAll(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in baseEnv)) delete process.env[key];
    });
    Object.assign(process.env, baseEnv);
    jest.resetModules();
  });

  it('sets strict-transport-security header', async () => {
    const res = await request(app).get('/api/v1/healthz');

    expect(res.statusCode).toBe(200);
    expect(res.headers['strict-transport-security']).toMatch(/max-age=15552000/);
  });
});
