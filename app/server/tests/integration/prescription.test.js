// app/server/tests/integration/prescription.test.js
const request = require('supertest');
const app = require('../../src/app');
const { ADMIN_USER, ADMIN_PASS } = require('../../src/config/env');

describe('Integration: Prescription API', () => {
  let token;

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: ADMIN_USER, 
        password: ADMIN_PASS, 
      });

    token = login.body.token;
  });

  it('should return prescription with valid token', async () => {
    const res = await request(app)
      .get('/api/v1/prescriptions/demo-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
  });
});