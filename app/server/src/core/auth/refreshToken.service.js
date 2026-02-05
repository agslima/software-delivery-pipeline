const { randomBytes, randomUUID, createHash } = require('crypto');
const { AppError } = require('../../api/http/errors/AppError');

class RefreshTokenService {
  constructor({ refreshTokensRepository, usersRepository, tokenService, ttlDays = 7, now = () => Date.now() }) {
    this.refreshTokensRepository = refreshTokensRepository;
    this.usersRepository = usersRepository;
    this.tokenService = tokenService;
    this.ttlDays = ttlDays;
    this.now = now;
  }

  _generateToken() {
    return randomBytes(48).toString('base64url');
  }

  _hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(userId) {
    const token = this._generateToken();
    const tokenHash = this._hashToken(token);
    const expiresAt = new Date(this.now() + this.ttlDays * 24 * 60 * 60 * 1000);

    await this.refreshTokensRepository.create({
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt,
    });

    return { refreshToken: token, expiresAt };
  }

  async rotate(refreshToken) {
    const tokenHash = this._hashToken(refreshToken || '');
    const record = await this.refreshTokensRepository.findByTokenHash(tokenHash);

    if (!record) {
      throw new AppError({ status: 401, code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' });
    }

    if (record.revoked_at) {
      throw new AppError({ status: 401, code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' });
    }

    if (record.expires_at && new Date(record.expires_at).getTime() < this.now()) {
      throw new AppError({ status: 401, code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' });
    }

    const user = await this.usersRepository.findById(record.user_id);
    if (!user) {
      throw new AppError({ status: 401, code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' });
    }

    await this.refreshTokensRepository.revoke(record.id, new Date(this.now()));
    const next = await this.issue(user.id);

    const accessToken = this.tokenService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfa_enabled,
    });

    return {
      accessToken,
      refreshToken: next.refreshToken,
      tokenType: 'Bearer',
    };
  }
}

module.exports = { RefreshTokenService };
