const request = require('supertest');
const app = require('../app'); // Import Express app

describe('Security Headers Check', () => {
  it('should return 200 OK for root route', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toEqual(200);
  });

  it('should have X-Content-Type-Options header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toEqual('nosniff');
  });
});
