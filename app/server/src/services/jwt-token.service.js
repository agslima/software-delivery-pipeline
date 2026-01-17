const jwt = require('jsonwebtoken');
const TokenService = require('./token.service');
const { secret, expiresIn } = require('../config/jwt');

class JwtTokenService extends TokenService {
  sign(payload) {
    return jwt.sign(payload, secret, { expiresIn });
  }

  verify(token) {
    return jwt.verify(token, secret);
  }
}

module.exports = new JwtTokenService();
