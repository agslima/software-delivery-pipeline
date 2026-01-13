const { ADMIN_USER, ADMIN_PASS } = require('../../config/env');

class AuthService {
  constructor(tokenService) {
    this.tokenService = tokenService;
  }

  login({ username, password }) {
    // Check for missing configuration (Fail Fast)
    if (!ADMIN_USER || !ADMIN_PASS) {
      throw new Error('Server misconfiguration: Admin credentials not set.');
    }

    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
      throw new Error('INVALID_CREDENTIALS');
    }

    return this.tokenService.sign({ sub: username });
  }
}

module.exports = AuthService;