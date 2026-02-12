const bcrypt = require('bcryptjs');
const { PasswordAuthService } = require('../../src/core/auth/passwordAuth.service');
const { LoginLockout } = require('../../src/core/auth/loginLockout');
const { AppError } = require('../../src/api/http/errors/AppError');
const { buildTestEmail, buildTestPassword, buildTestId } = require('../helpers/testCredentials');

describe('Unit: PasswordAuthService', () => {
  it('should reject when user does not exist', async () => {
    const usersRepository = { findByEmail: jest.fn().mockResolvedValue(null) };
    const tokenService = { sign: jest.fn() };
    const service = new PasswordAuthService({ usersRepository, tokenService });
    const missingEmail = buildTestEmail('missing');
    const missingPassword = buildTestPassword('missing');

    await expect(service.login({ email: missingEmail, password: missingPassword }))
      .rejects
      .toBeInstanceOf(AppError);
  });

  it('should reject when password is invalid', async () => {
    const correctPassword = buildTestPassword('correct');
    const wrongPassword = buildTestPassword('wrong');
    const email = buildTestEmail('doctor');
    const userId = buildTestId();
    const passwordHash = await bcrypt.hash(correctPassword, 10);
    const usersRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: userId,
        email,
        role: 'doctor',
        mfa_enabled: false,
        password_hash: passwordHash,
      }),
    };
    const tokenService = { sign: jest.fn() };
    const service = new PasswordAuthService({ usersRepository, tokenService });

    await expect(service.login({ email, password: wrongPassword }))
      .rejects
      .toBeInstanceOf(AppError);
  });

  it('should return access token and user summary on success', async () => {
    const correctPassword = buildTestPassword('correct');
    const email = buildTestEmail('doctor');
    const userId = buildTestId();
    const passwordHash = await bcrypt.hash(correctPassword, 10);
    const usersRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: userId,
        email,
        role: 'doctor',
        mfa_enabled: true,
        password_hash: passwordHash,
      }),
    };
    const tokenService = { sign: jest.fn().mockReturnValue('signed-token') };
    const service = new PasswordAuthService({ usersRepository, tokenService });

    const result = await service.login({ email, password: correctPassword });

    expect(result).toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      user: {
        id: userId,
        email,
        role: 'doctor',
        mfaEnabled: true,
      },
    });
  });

  it('should lock account after repeated failures', async () => {
    const correctPassword = buildTestPassword('correct');
    const wrongPassword = buildTestPassword('wrong');
    const email = buildTestEmail('doctor');
    const userId = buildTestId();
    const passwordHash = await bcrypt.hash(correctPassword, 10);
    const usersRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: userId,
        email,
        role: 'doctor',
        mfa_enabled: false,
        password_hash: passwordHash,
      }),
    };
    const tokenService = { sign: jest.fn().mockReturnValue('signed-token') };
    const now = jest.fn().mockReturnValue(0);
    const lockout = new LoginLockout({ maxFailures: 2, lockoutMinutes: 15, windowMinutes: 15, now });
    const service = new PasswordAuthService({ usersRepository, tokenService, lockout });

    await expect(service.login({ email, password: wrongPassword }))
      .rejects
      .toBeInstanceOf(AppError);

    await expect(service.login({ email, password: wrongPassword }))
      .rejects
      .toBeInstanceOf(AppError);

    await expect(service.login({ email, password: correctPassword }))
      .rejects
      .toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });
});
