// app-v2/server/tests/setup-env.js
process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.LOG_LEVEL = 'silent';
const { randomBytes } = require('crypto');

process.env.JWT_SECRET = randomBytes(32).toString('hex');
