// app/server/tests/integration/health.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('Health Check', () => {
  it('should return 200 OK at /health', async () => {
    const res = await request(app).get('/health');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      uptime: expect.any(Number)
    });
  });
});
