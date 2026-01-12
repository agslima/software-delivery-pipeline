const env = require('./env'); // Import validated config

module.exports = {
  // We can safely access env.JWT_SECRET because envalid guarantees it exists
  secret: env.JWT_SECRET,
  expiresIn: '1h',
};