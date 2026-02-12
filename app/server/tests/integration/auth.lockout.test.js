const bcrypt = require('bcryptjs');
const request = require('supertest');
const { buildTestUser, buildTestPassword, applyTestEnv } = require('../helpers/testCredentials');

const mockAuditEvents = [];
const mockUser = buildTestUser('doctor');
const correctPassword = buildTestPassword('correct');
const wrongPassword = buildTestPassword('wrong');

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
    applyTestEnv({
      LOGIN_MAX_FAILURES: '2',
      LOGIN_LOCK_MINUTES: '15',
      LOGIN_FAILURE_WINDOW_MINUTES: '15',
    });

    passwordHash = await bcrypt.hash(correctPassword, 10);
    mockUser.password_hash = passwordHash;

    jest.resetModules();
    app = buildApp();
  });

  it('locks after repeated failures and emits audit events', async () => {
    const payload = { email: mockUser.email, password: wrongPassword };

    const first = await request(app).post('/api/v2/auth/login').send(payload);
    expect(first.statusCode).toBe(401);

    const second = await request(app).post('/api/v2/auth/login').send(payload);
    expect(second.statusCode).toBe(401);

    const third = await request(app)
      .post('/api/v2/auth/login')
      .send({ email: mockUser.email, password: correctPassword });

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
