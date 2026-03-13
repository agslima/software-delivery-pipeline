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

      async revokeByTokenHash(tokenHash, revokedAt) {
        const token = mockRefreshTokens.find((t) => t.token_hash === tokenHash && !t.revoked_at);
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
    expect(login.body.refreshToken).toBeUndefined();
    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('refresh_token=')])
    );
    const issuedCookieHeader = login.headers['set-cookie'].find((value) => value.startsWith('refresh_token='));
    const issuedCookie = issuedCookieHeader.split(';')[0];

    const refresh = await request(app)
      .post('/api/v2/auth/refresh')
      .set('Cookie', issuedCookie);

    expect(refresh.statusCode).toBe(200);
    expect(refresh.body.accessToken).toBeDefined();
    expect(refresh.body.refreshToken).toBeUndefined();
    expect(refresh.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('refresh_token=')])
    );
    const rotatedCookieHeader = refresh.headers['set-cookie'].find((value) => value.startsWith('refresh_token='));
    const rotatedCookie = rotatedCookieHeader.split(';')[0];
    expect(rotatedCookie).not.toEqual(issuedCookie);

    const replay = await request(app)
      .post('/api/v2/auth/refresh')
      .set('Cookie', issuedCookie);

    expect(replay.statusCode).toBe(401);
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
    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('refresh_token=;')])
    );
  });

  it('returns revoked=false for unknown refresh token on logout', async () => {
    const missingRefreshToken = 'x'.repeat(48);
    const logout = await request(app)
      .post('/api/v2/auth/logout')
      .set('Cookie', `refresh_token=${missingRefreshToken}`);

    expect(logout.statusCode).toBe(200);
    expect(logout.body).toEqual({ revoked: false });
    expect(logout.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('refresh_token=;')])
    );
  });
});
