const { AppError } = require('../../api/http/errors/AppError');

class AuthService {
  constructor({ tokenService, adminUser, adminPass }) {
    this.tokenService = tokenService;
    this.adminUser = adminUser;
    this.adminPass = adminPass;
  }

  login({ username, password }) {
    if (!this.adminUser || !this.adminPass) {
      throw new AppError({
        status: 500,
        code: 'MISCONFIGURED_AUTH',
        message: 'Admin credentials not set',
      });
    }

    if (username !== this.adminUser || password !== this.adminPass) {
      throw new AppError({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
    }

    return this.tokenService.sign({ sub: username });
  }
}

module.exports = { AuthService };
