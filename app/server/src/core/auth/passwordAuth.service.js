const bcrypt = require('bcryptjs');
const { AppError } = require('../../api/http/errors/AppError');

class PasswordAuthService {
  constructor({ usersRepository, tokenService }) {
    this.usersRepository = usersRepository;
    this.tokenService = tokenService;
  }

  async login({ email, password }) {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new AppError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      throw new AppError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

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
