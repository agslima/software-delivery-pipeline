const env = require('./env'); // Import validated config

module.exports = {
  secret: env.JWT_SECRET,
  expiresIn: '1h',
};
