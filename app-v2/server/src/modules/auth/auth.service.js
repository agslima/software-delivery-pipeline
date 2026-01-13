const { adminUser, adminPass } = require('../../config/env');

class AuthService {
  constructor(tokenService) {
    this.tokenService = tokenService;
  }

  login({ username, password }) {
    if (!adminUser || !adminPass) {
      throw new Error('Server misconfiguration: Missing admin credentials');
    }

    if (username !== adminUser || password !== adminPass) {
      throw new Error('INVALID_CREDENTIALS');
    }

    return this.tokenService.sign({ sub: username });
  }
}

module.exports = AuthService;