require('dotenv').config();
const fs = require('fs');
const { cleanEnv, str, port } = require('envalid');

// Check test environment
const isTest = process.env.NODE_ENV === 'test';

/**
 * Helper: Read secret from Docker file, fallback to Env Var
 * @param {string} secretName - The name of the file in /run/secrets/ (lowercase usually)
 * @param {string} envVarName - The name of the process.env variable (fallback)
 */
const getSecret = (secretName, envVarName) => {
  try {
    // 1. Try to read from Docker Secret File (Standard Location)
    const secretPath = `/run/secrets/${secretName}`;
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch (err) {
    // Ignore errors (permission issues, etc) and proceed to fallback
  }

  // 2. Fallback to Standard Environment Variable (Local Dev / CI)
  return process.env[envVarName];
};

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
    default: isTest ? 'silent' : 'info'
  }),

  CORS_ORIGIN: str({
    desc: 'Comma-separated list of allowed CORS origins',
    default: 'http://localhost:5173,http://localhost:4173,http://localhost:8080'
  }),

  // 2. Security Config (HYBRID APPROACH)
  JWT_SECRET: str({ 
    desc: 'Secret for signing tokens',
    default: getSecret('jwt_secret', 'JWT_SECRET') 
  }),
  
  ADMIN_USER: str({ 
    desc: 'Admin username',
    default: process.env.ADMIN_USER 
  }),
  
  ADMIN_PASS: str({ 
    desc: 'Admin password',
    default: getSecret('admin_pass', 'ADMIN_PASS')
  }),
  
  // 3. Paths
  CLIENT_DIST_PATH: str({ default: '../../client/dist' }),

  // 4. Database Config
  DB_HOST: str({ default: 'localhost' }),
  DB_USER: str({ desc: 'Database User' }),
  
  DB_PASS: str({ 
    desc: 'Database Password',
    default: getSecret('db_pass', 'DB_PASS')
  }),
  
  DB_NAME: str({ desc: 'Database Name' }),
});

module.exports = env;
