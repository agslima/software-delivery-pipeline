const { buildTestId } = require('../helpers/testCredentials');

describe('Unit: infra v2/auth repositories', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.dontMock('../../src/infra/db/knex');
    jest.dontMock('../../src/infra/auth/jwtToken.service');
    jest.dontMock('../../src/config/jwt');
    jest.dontMock('../../src/observability/logger');
    jest.dontMock('../../src/config/oidc');
  });

  describe('RefreshTokensRepository', () => {
    const buildDb = () => {
      const first = jest.fn().mockResolvedValue({ id: 'rt-1' });
      const update = jest.fn().mockResolvedValue(1);
      const whereNull = jest.fn(() => ({ update }));
      const where = jest.fn(() => ({ first, update, whereNull }));
      const from = jest.fn(() => ({ where }));
      const into = jest.fn().mockResolvedValue([1]);
      const insert = jest.fn(() => ({ into }));
      const withSchema = jest.fn(() => ({ insert, from }));
      return { db: { withSchema }, withSchema, insert, into, from, where, whereNull, first, update };
    };

    it('creates and queries refresh tokens with expected schema calls', async () => {
      const { RefreshTokensRepository } = require('../../src/infra/v2/refreshTokens.repository');
      const { db, withSchema, insert, into, from, where, first } = buildDb();
      const repo = new RefreshTokensRepository(db);
      const tokenId = buildTestId();
      const userId = buildTestId();

      await expect(
        repo.create({ id: tokenId, userId, tokenHash: 'hash-1', expiresAt: '2099-01-01T00:00:00Z' })
      ).resolves.toEqual([1]);
      await expect(repo.findByTokenHash('hash-1')).resolves.toEqual({ id: 'rt-1' });

      expect(withSchema).toHaveBeenCalledWith('v2');
      expect(insert).toHaveBeenCalledWith({
        id: tokenId,
        user_id: userId,
        token_hash: 'hash-1',
        expires_at: '2099-01-01T00:00:00Z',
      });
      expect(into).toHaveBeenCalledWith('refresh_tokens');
      expect(from).toHaveBeenCalledWith('refresh_tokens');
      expect(where).toHaveBeenCalledWith({ token_hash: 'hash-1' });
      expect(first).toHaveBeenCalled();
    });

    it('returns guard defaults for empty identifiers and revokes tokens', async () => {
      const { RefreshTokensRepository } = require('../../src/infra/v2/refreshTokens.repository');
      const { db, where, whereNull, update } = buildDb();
      const repo = new RefreshTokensRepository(db);
      const revokedAt = new Date('2026-02-03T00:00:00Z');

      expect(repo.findByTokenHash('')).toBeNull();
      await expect(repo.revoke('rt-1', revokedAt)).resolves.toBe(1);
      await expect(repo.revokeByTokenHash('hash-2', revokedAt)).resolves.toBe(1);
      expect(repo.revokeByTokenHash('', revokedAt)).toBe(0);
      await expect(repo.revokeAllForUser('user-1', revokedAt)).resolves.toBe(1);
      expect(repo.revokeAllForUser('', revokedAt)).toBe(0);

      expect(where).toHaveBeenCalledWith({ id: 'rt-1' });
      expect(where).toHaveBeenCalledWith({ token_hash: 'hash-2' });
      expect(where).toHaveBeenCalledWith({ user_id: 'user-1' });
      expect(whereNull).toHaveBeenCalledWith('revoked_at');
      expect(update).toHaveBeenCalledWith({ revoked_at: revokedAt });
    });
  });

  describe('Audit repositories', () => {
    it('AuditConsoleRepository logs and returns empty list', async () => {
      const info = jest.fn();
      jest.doMock('../../src/observability/logger', () => ({ info }));

      let AuditConsoleRepository;
      jest.isolateModules(() => {
        ({ AuditConsoleRepository } = require('../../src/infra/v2/audit.console.repository'));
      });

      const repo = new AuditConsoleRepository();
      await expect(repo.create({ event_type: 'login' })).resolves.toBeUndefined();
      await expect(repo.list()).resolves.toEqual([]);
      expect(info).toHaveBeenCalledWith({ audit: { event_type: 'login' } }, 'AUDIT_EVENT');
    });

    it('AuditRepository composes list query filters', async () => {
      const offset = jest.fn(() => query);
      const limit = jest.fn(() => query);
      const orderBy = jest.fn(() => query);
      const select = jest.fn(() => query);
      const where = jest.fn(() => query);
      const from = jest.fn(() => query);
      const query = { select, from, orderBy, limit, offset, where };
      const withSchema = jest.fn(() => query);
      jest.doMock('../../src/infra/db/knex', () => ({ withSchema }));

      let AuditRepository;
      jest.isolateModules(() => {
        ({ AuditRepository } = require('../../src/infra/v2/audit.repository'));
      });

      const repo = new AuditRepository();
      const result = await repo.list({ eventType: 'x', actorUserId: 'u1', subjectType: 'patient', subjectId: 'p1', limit: 10, offset: 2 });

      expect(result).toBe(query);
      expect(withSchema).toHaveBeenCalledWith('v2');
      expect(from).toHaveBeenCalledWith('audit_events');
      expect(orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(limit).toHaveBeenCalledWith(10);
      expect(offset).toHaveBeenCalledWith(2);
      expect(where).toHaveBeenCalledWith('event_type', 'x');
      expect(where).toHaveBeenCalledWith('actor_user_id', 'u1');
      expect(where).toHaveBeenCalledWith('subject_type', 'patient');
      expect(where).toHaveBeenCalledWith('subject_id', 'p1');
    });
  });

  describe('Auth token services', () => {
    it('JwtTokenService signs and verifies with configured constraints', () => {
      const sign = jest.fn(() => 'signed-token');
      const verify = jest.fn(() => ({ sub: 'u1' }));
      jest.doMock('jsonwebtoken', () => ({ sign, verify }));
      jest.doMock('../../src/config/jwt', () => ({
        secret: 'secret',
        expiresIn: '15m',
        issuer: 'issuer',
        audience: 'aud',
        algorithms: ['HS256'],
      }));

      let service;
      jest.isolateModules(() => {
        service = require('../../src/infra/auth/jwtToken.service');
      });

      expect(service.sign({ sub: 'u1' })).toBe('signed-token');
      expect(service.signWithOptions({ sub: 'u1' }, { expiresIn: '1m' })).toBe('signed-token');
      expect(service.verify('token-1')).toEqual({ sub: 'u1' });

      expect(sign).toHaveBeenNthCalledWith(1, { sub: 'u1' }, 'secret', expect.objectContaining({ expiresIn: '15m', algorithm: 'HS256' }));
      expect(sign).toHaveBeenNthCalledWith(2, { sub: 'u1' }, 'secret', expect.objectContaining({ expiresIn: '1m', algorithm: 'HS256' }));
      expect(verify).toHaveBeenCalledWith('token-1', 'secret', expect.objectContaining({ algorithms: ['HS256'] }));
    });

    it('OidcTokenService fails closed when issuer/audience are missing', async () => {
      jest.doMock('../../src/config/oidc', () => ({
        issuer: '',
        audience: '',
        clockToleranceSeconds: 5,
        jwksUri: '',
      }));

      let service;
      jest.isolateModules(() => {
        service = require('../../src/infra/auth/oidcToken.service');
      });

      await expect(service.verify('token')).rejects.toMatchObject({
        status: 500,
        code: 'OIDC_NOT_CONFIGURED',
      });
    });
  });
});
