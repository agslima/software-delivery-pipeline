const { RefreshTokenService } = require('../../src/core/auth/refreshToken.service');
const { AppError } = require('../../src/api/http/errors/AppError');
const { buildTestEmail, buildTestId } = require('../helpers/testCredentials');

describe('Unit: RefreshTokenService', () => {
  it('rotates refresh token and revokes old one', async () => {
    const now = jest.fn().mockReturnValue(0);
    const tokens = [];
    const email = buildTestEmail('doctor');
    const userId = buildTestId();
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
      findById: jest.fn(async () => ({ id: userId, email, role: 'doctor', mfa_enabled: false })),
    };
    const tokenService = { sign: jest.fn().mockReturnValue('access-token') };

    const service = new RefreshTokenService({
      refreshTokensRepository,
      usersRepository,
      tokenService,
      ttlDays: 7,
      now,
    });

    const first = await service.issue(userId);
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
      revokeByTokenHash: jest.fn(),
      revokeAllForUser: jest.fn(),
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

  it('revokes a refresh token and returns user id', async () => {
    const now = jest.fn().mockReturnValue(0);
    const tokens = [];
    const refreshTokensRepository = {
      create: jest.fn(async ({ id, userId, tokenHash, expiresAt }) => {
        tokens.push({ id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked_at: null });
      }),
      findByTokenHash: jest.fn(async (tokenHash) => tokens.find((t) => t.token_hash === tokenHash)),
      revokeByTokenHash: jest.fn(async (tokenHash, revokedAt) => {
        const token = tokens.find((t) => t.token_hash === tokenHash);
        if (token) token.revoked_at = revokedAt;
      }),
      revokeAllForUser: jest.fn(),
    };
    const usersRepository = { findById: jest.fn() };
    const tokenService = { sign: jest.fn() };

    const service = new RefreshTokenService({
      refreshTokensRepository,
      usersRepository,
      tokenService,
      ttlDays: 7,
      now,
    });

    const issued = await service.issue('user-1');
    const result = await service.revoke(issued.refreshToken);

    expect(result.revoked).toBe(true);
    expect(result.userId).toBe('user-1');
    expect(tokens.filter((t) => t.revoked_at)).toHaveLength(1);
  });

  it('revokes all refresh tokens for a user', async () => {
    const now = jest.fn().mockReturnValue(0);
    const tokens = [];
    const refreshTokensRepository = {
      create: jest.fn(async ({ id, userId, tokenHash, expiresAt }) => {
        tokens.push({ id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked_at: null });
      }),
      findByTokenHash: jest.fn(async (tokenHash) => tokens.find((t) => t.token_hash === tokenHash)),
      revokeByTokenHash: jest.fn(),
      revokeAllForUser: jest.fn(async (userId, revokedAt) => {
        tokens.filter((t) => t.user_id === userId).forEach((t) => {
          t.revoked_at = revokedAt;
        });
      }),
    };
    const usersRepository = { findById: jest.fn() };
    const tokenService = { sign: jest.fn() };

    const service = new RefreshTokenService({
      refreshTokensRepository,
      usersRepository,
      tokenService,
      ttlDays: 7,
      now,
    });

    await service.issue('user-1');
    await service.issue('user-2');
    await service.issue('user-1');

    const result = await service.revokeAll('user-1');

    expect(result.revoked).toBe(true);
    expect(result.userId).toBe('user-1');
    expect(tokens.filter((t) => t.user_id === 'user-1' && t.revoked_at)).toHaveLength(2);
    expect(tokens.filter((t) => t.user_id === 'user-2' && t.revoked_at)).toHaveLength(0);
  });

  it('requires refresh token for revoke', async () => {
    const refreshTokensRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      revokeByTokenHash: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const usersRepository = { findById: jest.fn() };
    const tokenService = { sign: jest.fn() };

    const service = new RefreshTokenService({
      refreshTokensRepository,
      usersRepository,
      tokenService,
      ttlDays: 7,
    });

    await expect(service.revoke()).rejects.toBeInstanceOf(AppError);
  });

  it('returns not found when revoking unknown token', async () => {
    const refreshTokensRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(async () => null),
      revokeByTokenHash: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const usersRepository = { findById: jest.fn() };
    const tokenService = { sign: jest.fn() };

    const service = new RefreshTokenService({
      refreshTokensRepository,
      usersRepository,
      tokenService,
      ttlDays: 7,
    });

    const result = await service.revoke('missing-token');

    expect(result.revoked).toBe(false);
    expect(result.found).toBe(false);
    expect(result.reason).toBe('NOT_FOUND');
  });
});
