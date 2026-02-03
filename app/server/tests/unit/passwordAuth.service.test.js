const bcrypt = require('bcryptjs');
const { PasswordAuthService } = require('../../src/core/auth/passwordAuth.service');
const { AppError } = require('../../src/api/http/errors/AppError');

describe('Unit: PasswordAuthService', () => {
  it('should reject when user does not exist', async () => {
    const usersRepository = { findByEmail: jest.fn().mockResolvedValue(null) };
    const tokenService = { sign: jest.fn() };
    const service = new PasswordAuthService({ usersRepository, tokenService });

    await expect(service.login({ email: 'missing@test.com', password: 'DemoPass123!' }))
      .rejects
      .toBeInstanceOf(AppError);
  });

  it('should reject when password is invalid', async () => {
    const passwordHash = await bcrypt.hash('CorrectPass123!', 10);
    const usersRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'doctor@test.com',
        role: 'doctor',
        mfa_enabled: false,
        password_hash: passwordHash,
      }),
    };
    const tokenService = { sign: jest.fn() };
    const service = new PasswordAuthService({ usersRepository, tokenService });

    await expect(service.login({ email: 'doctor@test.com', password: 'WrongPass!' }))
      .rejects
      .toBeInstanceOf(AppError);
  });

  it('should return access token and user summary on success', async () => {
    const passwordHash = await bcrypt.hash('DemoPass123!', 10);
    const usersRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-2',
        email: 'doctor@test.com',
        role: 'doctor',
        mfa_enabled: true,
        password_hash: passwordHash,
      }),
    };
    const tokenService = { sign: jest.fn().mockReturnValue('signed-token') };
    const service = new PasswordAuthService({ usersRepository, tokenService });

    const result = await service.login({ email: 'doctor@test.com', password: 'DemoPass123!' });

    expect(result).toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      user: {
        id: 'user-2',
        email: 'doctor@test.com',
        role: 'doctor',
        mfaEnabled: true,
      },
    });
  });
});
