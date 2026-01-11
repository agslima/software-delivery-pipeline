class AuthService {
  constructor(tokenService) {
    this.tokenService = tokenService;
  }

  login({ username, password }) {
    if (username !== 'admin' || password !== 'password') {
      throw new Error('INVALID_CREDENTIALS');
    }

    return this.tokenService.sign({ sub: username });
  }
}

module.exports = AuthService;
