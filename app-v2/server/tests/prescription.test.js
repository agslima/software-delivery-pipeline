const request = require('supertest');
const app = require('./setup');

describe('Prescription API', () => {
  let token;

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'doctor@demo.com',
        password: 'password123',
      });

    token = login.body.token;
  });

  it('should deny access without token', async () => {
    const res = await request(app)
      .get('/api/v1/prescriptions/demo-id');

    expect(res.statusCode).toBe(401);
  });

  it('should return prescription with valid token', async () => {
    const res = await request(app)
      .get('/api/v1/prescriptions/demo-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('clinicName');
    expect(res.body).toHaveProperty('doctor');
    expect(res.body).toHaveProperty('patient');
    expect(res.body).toHaveProperty('medications');
  });

  it('should return 404 for unknown prescription', async () => {
    const res = await request(app)
      .get('/api/v1/prescriptions/unknown-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
  });
});
