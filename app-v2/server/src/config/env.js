require('dotenv').config();
const { cleanEnv, str, port, url } = require('envalid');

// Check if we are in a test environment (CI/CD or local testing)
const isTest = process.env.NODE_ENV === 'test';

const env = cleanEnv(process.env, {
  // 1. Core Config
  NODE_ENV: str({ 
    choices: ['development', 'test', 'production'],
    default: 'development' 
  }),
  PORT: port({ 
    default: 8080,
    desc: 'API server port'
  }),
  LOG_LEVEL: str({
    choices: ['info', 'debug', 'error', 'silent'],
    default: isTest ? 'silent' : 'info' // Silence logs during tests
  }),

  // 2. Security Config
  // TRICK: validation will fail in Prod if missing, but pass in Test with a default.
  JWT_SECRET: str({ 
    desc: 'Critical secret for signing JWT tokens',
    default: isTest ? 'test-jwt-secret' : undefined 
  }),

  ADMIN_USER: str({
    desc: 'Username for the admin account',
    default: isTest ? 'admin' : undefined
  }),
  ADMIN_PASS: str({
    desc: 'Secure password for the admin account',
    default: isTest ? 'password' : undefined
  }),
  
  // 3. Paths
  CLIENT_DIST_PATH: str({ default: '../../client/dist' }),
});

module.exports = env;