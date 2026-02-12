const bcrypt = require('bcryptjs');
const request = require('supertest');
const { buildTestUser, buildTestPassword, applyTestEnv } = require('../helpers/testCredentials');

const mockRefreshTokens = [];
const mockUser = buildTestUser('doctor');
const correctPassword = buildTestPassword('correct');

jest.mock('../../src/infra/users/users.repository', () => {
  return {
    UsersRepository: class UsersRepository {
      async findByEmail(email) {
        if (!email) return null;
        return email.toLowerCase() === mockUser.email ? mockUser : null;
      }

      async findById(id) {
        return id === mockUser.id ? mockUser : null;
      }
    },
  };
});

jest.mock('../../src/infra/v2/refreshTokens.repository', () => {
  return {
    RefreshTokensRepository: class RefreshTokensRepository {
      async create({ id, userId, tokenHash, expiresAt }) {
        mockRefreshTokens.push({
          id,
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expiresAt,
          revoked_at: null,
        });
      }

      async findByTokenHash(tokenHash) {
        return mockRefreshTokens.find((token) => token.token_hash === tokenHash) || null;
      }

      async revoke(id, revokedAt) {
        const token = mockRefreshTokens.find((t) => t.id === id);
        if (token) token.revoked_at = revokedAt;
      }
    },
  };
});

const buildApp = () => {
  const createApp = require('../../src/app/createApp');
  return createApp();
};

describe('Integration: Auth refresh', () => {
  let app;

  beforeEach(async () => {
    mockRefreshTokens.length = 0;
    applyTestEnv({
      LOGIN_MAX_FAILURES: '5',
      LOGIN_LOCK_MINUTES: '15',
      LOGIN_FAILURE_WINDOW_MINUTES: '15',
      REFRESH_TOKEN_TTL_DAYS: '7',
    });

    mockUser.password_hash = await bcrypt.hash(correctPassword, 10);
    jest.resetModules();
    app = buildApp();
  });

  it('issues refresh token on login and rotates on refresh', async () => {
    const login = await request(app)
      .post('/api/v2/auth/login')
      .send({ email: mockUser.email, password: correctPassword });

    expect(login.statusCode).toBe(200);
    expect(login.body.mfaRequired).toBeUndefined();
    expect(login.body.refreshToken).toBeDefined();

    const refresh = await request(app)
      .post('/api/v2/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(refresh.statusCode).toBe(200);
    expect(refresh.body.accessToken).toBeDefined();
    expect(refresh.body.refreshToken).toBeDefined();
    expect(refresh.body.refreshToken).not.toBe(login.body.refreshToken);
  });

  it('returns mfaRequired when user has MFA enabled', async () => {
    mockUser.mfa_enabled = true;

    const login = await request(app)
      .post('/api/v2/auth/login')
      .send({ email: mockUser.email, password: correctPassword });

    expect(login.statusCode).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.mfaToken).toBeDefined();
    expect(login.body.refreshToken).toBeUndefined();
  });
});
