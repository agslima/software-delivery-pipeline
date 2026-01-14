const env = require('./env');

module.exports = {
  secret: env.JWT_SECRET,
  expiresIn: '1h',
};
