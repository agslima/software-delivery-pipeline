const { buildTestId, buildTestEmail } = require('../helpers/testCredentials');

const loadController = ({
  loginResult,
  loginError,
  issueResult = { refreshToken: 'refresh-1' },
  revokeResult = { revoked: true, userId: 'user-1' },
  findByIdResult = { id: 'user-1', mfa_secret: 'abc', mfa_enabled: true },
  verifyResult = { verified: true },
  enrollResult = { secret: 'ABC', qrCodeDataUrl: 'data:image/png;base64,x' },
} = {}) => {
  jest.resetModules();

  const login = loginError ? jest.fn().mockRejectedValue(loginError) : jest.fn().mockResolvedValue(loginResult);
  const issue = jest.fn().mockResolvedValue(issueResult);
  const rotate = jest.fn();
  const revoke = jest.fn().mockResolvedValue(revokeResult);
  const revokeAll = jest.fn().mockResolvedValue({ revoked: true });
  const verify = jest.fn().mockResolvedValue(verifyResult);
  const enroll = jest.fn().mockResolvedValue(enrollResult);
  const findById = jest.fn().mockResolvedValue(findByIdResult);
  const setMfaEnabled = jest.fn().mockResolvedValue(1);
  const setMfaSecret = jest.fn().mockResolvedValue(1);
  const sign = jest.fn().mockReturnValue('access-token');
  const signWithOptions = jest.fn().mockReturnValue('mfa-token');
  const safeAudit = jest.fn().mockResolvedValue(undefined);
  const buildAuditContext = jest.fn().mockReturnValue({ metadata: { requestId: 'req-1' }, ipAddress: '127.0.0.1' });

  jest.doMock('../../src/core/auth/passwordAuth.service', () => ({
    PasswordAuthService: jest.fn().mockImplementation(() => ({ login })),
  }));
  jest.doMock('../../src/core/auth/refreshToken.service', () => ({
    RefreshTokenService: jest.fn().mockImplementation(() => ({ issue, rotate, revoke, revokeAll })),
  }));
  jest.doMock('../../src/core/auth/mfa.service', () => ({
    MfaService: jest.fn().mockImplementation(() => ({ verify, enroll })),
  }));
  jest.doMock('../../src/infra/users/users.repository', () => ({
    UsersRepository: jest.fn().mockImplementation(() => ({ findById, setMfaEnabled, setMfaSecret })),
  }));
  jest.doMock('../../src/infra/auth/jwtToken.service', () => ({ sign, signWithOptions }));
  jest.doMock('../../src/api/v2/audit/audit.helpers', () => ({ buildAuditContext, safeAudit }));
  jest.doMock('../../src/config/env', () => ({
    LOGIN_MAX_FAILURES: 5,
    LOGIN_LOCK_MINUTES: 15,
    LOGIN_FAILURE_WINDOW_MINUTES: 15,
    REFRESH_TOKEN_TTL_DAYS: 7,
    MFA_TOKEN_TTL_MINUTES: 5,
    JWT_ISSUER: 'stayhealthy',
  }));
  jest.doMock('../../src/config/audit', () => ({ sink: 'console', piiRedaction: 'none' }));
  jest.doMock('../../src/core/auth/loginLockout', () => ({ LoginLockout: jest.fn().mockImplementation(() => ({})) }));
  jest.doMock('../../src/core/v2/audit.service', () => ({ AuditService: jest.fn().mockImplementation(() => ({})) }));
  jest.doMock('../../src/infra/v2/audit.repository', () => ({ AuditRepository: jest.fn().mockImplementation(() => ({})) }));
  jest.doMock('../../src/infra/v2/audit.console.repository', () => ({ AuditConsoleRepository: jest.fn().mockImplementation(() => ({})) }));
  jest.doMock('../../src/infra/v2/refreshTokens.repository', () => ({ RefreshTokensRepository: jest.fn().mockImplementation(() => ({})) }));

  let controller;
  jest.isolateModules(() => {
    controller = require('../../src/api/v2/auth/auth.controller');
  });

  return {
    controller,
    mocks: {
      login,
      issue,
      revoke,
      verify,
      enroll,
      findById,
      setMfaEnabled,
      setMfaSecret,
      sign,
      signWithOptions,
      safeAudit,
      buildAuditContext,
    },
  };
};

describe('Unit: api/v2/auth.controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('login returns MFA challenge when user requires MFA', async () => {
    const userId = buildTestId();
    const email = buildTestEmail('doctor');
    const { controller, mocks } = loadController({
      loginResult: { user: { id: userId, email, role: 'doctor', mfaEnabled: true } },
    });

    const req = { body: { email, password: 'secret' } };
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };
    const next = jest.fn();

    await controller.login(req, res, next);

    expect(mocks.signWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ sub: userId, mfa: true }),
      { expiresIn: '5m' }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      mfaRequired: true,
      mfaToken: 'mfa-token',
      user: { id: userId, email, role: 'doctor', mfaEnabled: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('login issues refresh token when MFA is not required', async () => {
    const userId = buildTestId();
    const email = buildTestEmail('patient');
    const { controller, mocks } = loadController({
      loginResult: {
        accessToken: 'access-1',
        tokenType: 'Bearer',
        user: { id: userId, email, role: 'patient', mfaEnabled: false },
      },
      issueResult: { refreshToken: 'refresh-xyz' },
    });

    const req = { body: { email, password: 'secret' } };
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };

    await controller.login(req, res, jest.fn());

    expect(mocks.issue).toHaveBeenCalledWith(userId);
    expect(json).toHaveBeenCalledWith({
      accessToken: 'access-1',
      tokenType: 'Bearer',
      user: { id: userId, email, role: 'patient', mfaEnabled: false },
      refreshToken: 'refresh-xyz',
    });
  });

  it('login audits invalid credentials failures and forwards error', async () => {
    const error = { code: 'INVALID_CREDENTIALS' };
    const { controller, mocks } = loadController({ loginError: error });

    const req = { body: { email: buildTestEmail('bad'), password: 'secret' } };
    const next = jest.fn();

    await controller.login(req, { status: jest.fn() }, next);

    expect(mocks.safeAudit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ eventType: 'login_failed', subjectType: 'user' })
    );
    expect(next).toHaveBeenCalledWith(error);
  });

  it('revoke returns revoked=true and emits revoke audit event', async () => {
    const { controller, mocks } = loadController({ revokeResult: { revoked: true, userId: 'user-1' } });
    const req = { body: { refreshToken: 'refresh-1' }, user: { sub: 'user-1' } };
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };

    await controller.revoke(req, res, jest.fn());

    expect(mocks.revoke).toHaveBeenCalledWith('refresh-1');
    expect(mocks.safeAudit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ eventType: 'refresh_token_revoked', subjectId: 'user-1' })
    );
    expect(json).toHaveBeenCalledWith({ revoked: true });
  });

  it('revoke returns revoked=false without emitting revoke audit event', async () => {
    const { controller, mocks } = loadController({ revokeResult: { revoked: false, userId: 'user-1' } });
    const req = { body: { refreshToken: 'refresh-1' }, user: { sub: 'user-1' } };
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };

    await controller.revoke(req, res, jest.fn());

    expect(mocks.revoke).toHaveBeenCalledWith('refresh-1');
    expect(mocks.safeAudit).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ revoked: false });
  });

  it('mfaStatus returns unauthorized when user is missing', async () => {
    const { controller } = loadController({ findByIdResult: null });
    const next = jest.fn();

    await controller.mfaStatus({ user: { sub: 'missing' } }, { status: jest.fn() }, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 }));
  });

  it('verifyMfa returns token payload and audits success', async () => {
    const { controller, mocks } = loadController({ verifyResult: { verified: true } });
    const req = { user: { sub: 'user-1', email: 'p@example.test', role: 'patient' }, body: { code: '123456' } };
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };

    await controller.verifyMfa(req, res, jest.fn());

    expect(mocks.verify).toHaveBeenCalledWith({ userId: 'user-1', code: '123456' });
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'user-1', mfaEnabled: true }));
    expect(mocks.safeAudit).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ eventType: 'mfa_verified' }));
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access-token', refreshToken: 'refresh-1', tokenType: 'Bearer' }));
  });
});
