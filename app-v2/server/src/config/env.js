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

  CORS_ORIGIN: str({
    desc: 'Comma-separated list of allowed CORS origins',
    default: 'http://localhost:5173,http://localhost:4173,http://localhost:8080'
  }),

  // 2. Security Config
  JWT_SECRET: str({ desc: 'Secret for signing tokens' }),
  ADMIN_USER: str({ desc: 'Admin username' }),
  ADMIN_PASS: str({ desc: 'Admin password' }),
  
  // 3. Paths
  CLIENT_DIST_PATH: str({ default: '../../client/dist' }),
});

module.exports = env;