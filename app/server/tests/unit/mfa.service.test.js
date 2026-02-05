jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr'),
}));

const { MfaService, generateCode } = require('../../src/core/auth/mfa.service');
const { AppError } = require('../../src/api/http/errors/AppError');

describe('Unit: MfaService', () => {
  it('verifies valid code and enables MFA', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = jest.fn().mockReturnValue(0);
    const usersRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        mfa_secret: secret,
        mfa_enabled: false,
      }),
      setMfaEnabled: jest.fn(),
    };
    const service = new MfaService({ usersRepository, now });
    const code = generateCode(secret, { time: 0 });

    const result = await service.verify({ userId: 'user-1', code });

    expect(result).toEqual({ verified: true });
    expect(usersRepository.setMfaEnabled).toHaveBeenCalledWith('user-1', true);
  });

  it('rejects invalid code', async () => {
    const usersRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        mfa_secret: 'JBSWY3DPEHPK3PXP',
        mfa_enabled: true,
      }),
      setMfaEnabled: jest.fn(),
    };
    const service = new MfaService({ usersRepository, now: () => 0 });

    await expect(service.verify({ userId: 'user-1', code: '000000' }))
      .rejects
      .toBeInstanceOf(AppError);
  });
});
