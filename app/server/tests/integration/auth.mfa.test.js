const request = require('supertest');

const mockAuditEvents = [];
const mockUser = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'doctor@test.com',
  role: 'doctor',
  mfa_enabled: false,
  mfa_secret: 'JBSWY3DPEHPK3PXP',
};

jest.mock('../../src/infra/users/users.repository', () => {
  return {
    UsersRepository: class UsersRepository {
      async findById(id) {
        return id === mockUser.id ? mockUser : null;
      }

      async setMfaEnabled(id, enabled) {
        if (id === mockUser.id) mockUser.mfa_enabled = enabled;
      }

      async setMfaSecret(id, secret) {
        if (id === mockUser.id) mockUser.mfa_secret = secret;
      }
    },
  };
});

jest.mock('../../src/infra/v2/refreshTokens.repository', () => {
  const tokens = [];
  return {
    RefreshTokensRepository: class RefreshTokensRepository {
      async create({ id, userId, tokenHash, expiresAt }) {
        tokens.push({
          id,
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expiresAt,
          revoked_at: null,
        });
      }

      async findByTokenHash(tokenHash) {
        return tokens.find((token) => token.token_hash === tokenHash) || null;
      }

      async revoke(id, revokedAt) {
        const token = tokens.find((t) => t.id === id);
        if (token) token.revoked_at = revokedAt;
      }
    },
  };
});

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr'),
}));

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
  };
});

const buildApp = () => {
  const createApp = require('../../src/app/createApp');
  return createApp();
};

const { generateCode } = require('../../src/core/auth/mfa.service');
const tokenService = require('../../src/infra/auth/jwtToken.service');

describe('Integration: Auth MFA verify', () => {
  let app;
  let accessToken;
  let mfaToken;

  beforeEach(() => {
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

    jest.resetModules();
    app = buildApp();
    accessToken = tokenService.sign({ sub: mockUser.id, email: mockUser.email, role: mockUser.role, mfaEnabled: false });
    mfaToken = tokenService.signWithOptions(
      { sub: mockUser.id, email: mockUser.email, role: mockUser.role, mfa: true },
      { expiresIn: '5m' }
    );
  });

  it('verifies MFA code and writes audit event', async () => {
    const code = generateCode(mockUser.mfa_secret, { time: Date.now() });
    const res = await request(app)
      .post('/api/v2/auth/mfa/verify')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ code });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ verified: true });
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.tokenType).toBe('Bearer');
    expect(mockUser.mfa_enabled).toBe(true);
    expect(mockAuditEvents.some((evt) => evt.event_type === 'mfa_verified')).toBe(true);
  });

  it('enrolls MFA and returns QR code data', async () => {
    const res = await request(app)
      .post('/api/v2/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'StayHealthy' });

    expect(res.statusCode).toBe(200);
    expect(res.body.secret).toBeDefined();
    expect(res.body.otpauthUrl).toContain('otpauth://totp/');
    expect(res.body.qrCodeDataUrl).toContain('data:image');
    expect(mockAuditEvents.some((evt) => evt.event_type === 'mfa_enrolled')).toBe(true);
  });

  it('returns MFA status', async () => {
    const res = await request(app)
      .get('/api/v2/auth/mfa/status')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ configured: true, enabled: false });
  });
});
