require('dotenv').config();
const { cleanEnv, str, port, url } = require('envalid');

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
    default: 'info'
  }),

  // 2. Security Config (Required)
  JWT_SECRET: str({ 
    desc: 'Critical secret for signing JWT tokens' 
  }),

  ADMIN_USER: str({
    desc: 'Username for the admin account',
    example: 'admin'
  }),
  ADMIN_PASS: str({
    desc: 'Secure password for the admin account'
  }),
  
  // 3. Paths
  CLIENT_DIST_PATH: str({ default: '../../client/dist' }),
});

module.exports = env;