const bcrypt = require('bcryptjs');
const request = require('supertest');

const mockAuditEvents = [];
const mockUser = {
  id: '99999999-9999-4999-8999-999999999999',
  email: 'doctor@test.com',
  role: 'doctor',
  mfa_enabled: false,
};

jest.mock('../../src/infra/users/users.repository', () => {
  return {
    UsersRepository: class UsersRepository {
      async findByEmail(email) {
        if (!email) return null;
        return email.toLowerCase() === mockUser.email ? mockUser : null;
      }
    },
  };
});

jest.mock('../../src/infra/v2/audit.repository', () => {
  return {
    AuditRepository: class AuditRepository {
      async create(event) {
        mockAuditEvents.push(event);
      }

      async list() {
        return mockAuditEvents;
      }
    },
    __events: mockAuditEvents,
  };
});

const buildApp = () => {
  const createApp = require('../../src/app/createApp');
  return createApp();
};

describe('Integration: Auth lockout & audit', () => {
  let app;
  let passwordHash;

  beforeEach(async () => {
    mockAuditEvents.length = 0;
    process.env.NODE_ENV = 'test';
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
    process.env.LOGIN_MAX_FAILURES = '2';
    process.env.LOGIN_LOCK_MINUTES = '15';
    process.env.LOGIN_FAILURE_WINDOW_MINUTES = '15';

    passwordHash = await bcrypt.hash('CorrectPass123!', 10);
    mockUser.password_hash = passwordHash;

    jest.resetModules();
    app = buildApp();
  });

  it('locks after repeated failures and emits audit events', async () => {
    const payload = { email: mockUser.email, password: 'WrongPass!' };

    const first = await request(app).post('/api/v2/auth/login').send(payload);
    expect(first.statusCode).toBe(401);

    const second = await request(app).post('/api/v2/auth/login').send(payload);
    expect(second.statusCode).toBe(401);

    const third = await request(app)
      .post('/api/v2/auth/login')
      .send({ email: mockUser.email, password: 'CorrectPass123!' });

    expect(third.statusCode).toBe(429);
    expect(mockAuditEvents.filter((evt) => evt.event_type === 'login_failed')).toHaveLength(3);
    expect(mockAuditEvents[0]).toMatchObject({
      event_type: 'login_failed',
      subject_type: 'user',
      subject_id: null,
    });
    expect(mockAuditEvents[0].metadata).toMatchObject({ email: mockUser.email, reason: 'INVALID_CREDENTIALS' });
    expect(mockAuditEvents[2].metadata).toMatchObject({ reason: 'ACCOUNT_LOCKED' });
  });
});
