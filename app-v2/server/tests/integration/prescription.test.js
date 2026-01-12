const request = require('supertest');
const app = require('../../src/app');

describe('Integration: Prescription API', () => {
  let token;

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'admin',   // Changed from email
        password: 'password', // Changed from password123
      });

    token = login.body.token;
    
    // Safety check to ensure login worked before running other tests
    if (!token) {
      throw new Error('Login failed in beforeAll hook. Check AuthService credentials.');
    }
  });

  describe('GET /api/v1/prescriptions/:id', () => {
    
    // 1. Missing Token
    it('should return 401 when authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/prescriptions/demo-id');
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    // 2. Invalid Token (New Coverage)
    it('should return 401 when token is invalid', async () => {
      const res = await request(app)
        .get('/api/v1/prescriptions/demo-id')
        .set('Authorization', 'Bearer invalid_fake_token');
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    // 3. Valid Request
    it('should return full prescription data with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/prescriptions/demo-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      
      // Detailed assertions
      expect(res.body).toEqual(expect.objectContaining({
        clinicName: 'StayHealthy',
        doctor: expect.objectContaining({ name: 'Dr. Emily Johnson' }),
        patient: expect.objectContaining({ name: 'John Smith' })
      }));
    });

    // 4. Not Found
    it('should return 404 for non-existent prescription ID', async () => {
      const res = await request(app)
        .get('/api/v1/prescriptions/unknown-id-999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
    });
  });
});
