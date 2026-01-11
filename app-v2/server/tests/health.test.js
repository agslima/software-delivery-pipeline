const request = require('supertest');
const app = require('./setup');

describe('GET /health', () => {
  it('should return system health', async () => {
    const res = await request(app).get('/health');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('uptime');
  });
});
