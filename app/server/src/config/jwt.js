const env = require('./env');

module.exports = {
  secret: env.JWT_SECRET,
  expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  algorithms: ['HS256'],
};
