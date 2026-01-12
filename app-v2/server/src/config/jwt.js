module.exports = {
  secret: process.env.JWT_SECRET || 'test-secret',
  expiresIn: '1h'
};
