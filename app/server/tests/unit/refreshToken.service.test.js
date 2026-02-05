const { RefreshTokenService } = require('../../src/core/auth/refreshToken.service');
const { AppError } = require('../../src/api/http/errors/AppError');

describe('Unit: RefreshTokenService', () => {
  it('rotates refresh token and revokes old one', async () => {
    const now = jest.fn().mockReturnValue(0);
    const tokens = [];
    const refreshTokensRepository = {
      create: jest.fn(async ({ id, userId, tokenHash, expiresAt }) => {
        tokens.push({ id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked_at: null });
      }),
      findByTokenHash: jest.fn(async (tokenHash) => tokens.find((t) => t.token_hash === tokenHash)),
      revoke: jest.fn(async (id, revokedAt) => {
        const token = tokens.find((t) => t.id === id);
        if (token) token.revoked_at = revokedAt;
      }),
    };
    const usersRepository = {
      findById: jest.fn(async () => ({ id: 'user-1', email: 'doc@test.com', role: 'doctor', mfa_enabled: false })),
    };
    const tokenService = { sign: jest.fn().mockReturnValue('access-token') };

    const service = new RefreshTokenService({
      refreshTokensRepository,
      usersRepository,
      tokenService,
      ttlDays: 7,
      now,
    });

    const first = await service.issue('user-1');
    const rotated = await service.rotate(first.refreshToken);

    expect(rotated.accessToken).toBe('access-token');
    expect(rotated.refreshToken).toBeDefined();
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    expect(tokens.filter((t) => t.revoked_at)).toHaveLength(1);
  });

  it('rejects invalid refresh token', async () => {
    const refreshTokensRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(async () => null),
      revoke: jest.fn(),
    };
    const usersRepository = { findById: jest.fn() };
    const tokenService = { sign: jest.fn() };

    const service = new RefreshTokenService({
      refreshTokensRepository,
      usersRepository,
      tokenService,
      ttlDays: 7,
    });

    await expect(service.rotate('bad-token')).rejects.toBeInstanceOf(AppError);
  });
});
