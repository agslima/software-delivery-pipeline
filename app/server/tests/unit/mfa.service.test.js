jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr'),
}));

const { MfaService, generateCode } = require('../../src/core/auth/mfa.service');
const { AppError } = require('../../src/api/http/errors/AppError');
const { buildBase32Secret, buildTestId } = require('../helpers/testCredentials');

describe('Unit: MfaService', () => {
  it('verifies valid code and enables MFA', async () => {
    const secret = buildBase32Secret();
    const now = jest.fn().mockReturnValue(0);
    const userId = buildTestId();
    const usersRepository = {
      findById: jest.fn().mockResolvedValue({
        id: userId,
        mfa_secret: secret,
        mfa_enabled: false,
      }),
      setMfaEnabled: jest.fn(),
    };
    const service = new MfaService({ usersRepository, now });
    const code = generateCode(secret, { time: 0 });

    const result = await service.verify({ userId, code });

    expect(result).toEqual({ verified: true });
    expect(usersRepository.setMfaEnabled).toHaveBeenCalledWith(userId, true);
  });

  it('rejects invalid code', async () => {
    const userId = buildTestId();
    const usersRepository = {
      findById: jest.fn().mockResolvedValue({
        id: userId,
        mfa_secret: buildBase32Secret(),
        mfa_enabled: true,
      }),
      setMfaEnabled: jest.fn(),
    };
    const service = new MfaService({ usersRepository, now: () => 0 });

    await expect(service.verify({ userId, code: '000000' }))
      .rejects
      .toBeInstanceOf(AppError);
  });
});
