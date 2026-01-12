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

  // 2. Security Config (No defaults = Required)
  // If this is missing, the app will CRASH with a clear error message.
  JWT_SECRET: str({ 
    desc: 'Critical secret for signing JWT tokens' 
  }),
  
  // DB integration:
  // DB_URL: url({ desc: 'PostgreSQL Connection String' }),
  CLIENT_DIST_PATH: str({ default: '../../client/dist' }),
});

module.exports = env;