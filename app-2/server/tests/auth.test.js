const request = require('supertest');
const app = require('./setup');

describe('Authentication', () => {
  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'doctor@demo.com',
        password: 'password123',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('should reject invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'doctor@demo.com',
        password: 'wrong-password',
      });

    expect(res.statusCode).toBe(401);
  });
});
