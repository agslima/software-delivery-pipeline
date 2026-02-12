const baseEnv = { ...process.env };
const { buildTestEmail, buildTestId } = require('../helpers/testCredentials');

const buildReq = () => ({
  header: jest.fn().mockReturnValue('Bearer test-token'),
});

const setup = ({ envOverrides = {}, payload, user } = {}) => {
  jest.resetModules();

  process.env.OIDC_ENABLED = 'true';
  process.env.OIDC_REQUIRED = 'false';
  process.env.OIDC_ISSUER = 'https://issuer.example.com';
  process.env.OIDC_AUDIENCE = 'api://audience';
  process.env.OIDC_MFA_REQUIRED_ROLES = 'doctor,admin';
  process.env.OIDC_REQUIRED_AMR = 'mfa';
  process.env.OIDC_REQUIRED_ACR = '';

  Object.entries(envOverrides).forEach(([key, value]) => {
    process.env[key] = value;
  });

  const usersRepoInstance = {
    findByEmail: jest.fn(async () => user),
  };
  const jwtToken = {
    decode: jest.fn().mockReturnValue({
      iss: 'https://issuer.example.com',
      aud: 'api://audience',
    }),
    verify: jest.fn(),
  };
  const oidcToken = {
    verify: jest.fn().mockResolvedValue(payload),
  };

  jest.doMock('../../src/infra/users/users.repository', () => ({
    UsersRepository: jest.fn().mockImplementation(() => usersRepoInstance),
  }));
  jest.doMock('../../src/infra/auth/jwtToken.service', () => jwtToken);
  jest.doMock('../../src/infra/auth/oidcToken.service', () => oidcToken);

  let auth;
  jest.isolateModules(() => {
    auth = require('../../src/api/http/middleware/auth');
  });

  return { auth, usersRepoInstance, jwtToken, oidcToken };
};

describe('Unit: OIDC auth middleware', () => {
  afterAll(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in baseEnv)) delete process.env[key];
    });
    Object.assign(process.env, baseEnv);
  });

  it('rejects doctor when required amr is missing', async () => {
    const email = buildTestEmail('doctor');
    const userId = buildTestId();
    const { auth } = setup({
      payload: { sub: 'oidc-sub', email },
      user: { id: userId, email, role: 'doctor', mfa_enabled: true },
    });

    const req = buildReq();
    const res = {};
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('MFA_REQUIRED');
  });

  it('allows doctor when amr includes required value', async () => {
    const email = buildTestEmail('doctor');
    const userId = buildTestId();
    const { auth } = setup({
      payload: { sub: 'oidc-sub', email, amr: ['mfa'] },
      user: { id: userId, email, role: 'doctor', mfa_enabled: true },
    });

    const req = buildReq();
    const res = {};
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(req.user).toEqual(expect.objectContaining({
      sub: userId,
      email,
      role: 'doctor',
      oidc: true,
    }));
  });

  it('rejects doctor when required acr is missing', async () => {
    const email = buildTestEmail('doctor');
    const userId = buildTestId();
    const { auth } = setup({
      envOverrides: {
        OIDC_REQUIRED_AMR: '',
        OIDC_REQUIRED_ACR: 'urn:mfa',
      },
      payload: { sub: 'oidc-sub', email, acr: 'urn:low' },
      user: { id: userId, email, role: 'doctor', mfa_enabled: true },
    });

    const req = buildReq();
    const res = {};
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('MFA_REQUIRED');
  });
});
