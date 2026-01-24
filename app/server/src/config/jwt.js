const env = require('./env');

module.exports = {
  secret: env.JWT_SECRET,
  expiresIn: '1h',
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  algorithms: ['HS256'],
};

