const bcrypt = require('bcryptjs');
const { AppError } = require('../../api/http/errors/AppError');

class PasswordAuthService {
  constructor({ usersRepository, tokenService, lockout }) {
    this.usersRepository = usersRepository;
    this.tokenService = tokenService;
    this.lockout = lockout;
  }

  async login({ email, password }) {
    const key = email ? email.toLowerCase().trim() : null;
    if (this.lockout && this.lockout.isLocked(key)) {
      throw new AppError({
        status: 429,
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Try again later.',
      });
    }

    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      if (this.lockout) this.lockout.registerFailure(key);
      throw new AppError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      if (this.lockout) this.lockout.registerFailure(key);
      throw new AppError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    if (this.lockout) this.lockout.registerSuccess(key);
    const accessToken = this.tokenService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfa_enabled,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfa_enabled,
      },
    };
  }
}

module.exports = { PasswordAuthService };
