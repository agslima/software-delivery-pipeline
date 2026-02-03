const jwt = require('jsonwebtoken');
const jwtCfg = require('../../config/jwt');

class JwtTokenService {
  sign(payload) {
    return jwt.sign(payload, jwtCfg.secret, {
      expiresIn: jwtCfg.expiresIn,
      issuer: jwtCfg.issuer,
      audience: jwtCfg.audience,
      algorithm: jwtCfg.algorithms[0],
    });
  }

  verify(token) {
    return jwt.verify(token, jwtCfg.secret, {
      issuer: jwtCfg.issuer,
      audience: jwtCfg.audience,
      algorithms: jwtCfg.algorithms,
    });
  }
}

module.exports = new JwtTokenService();

