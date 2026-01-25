require('dotenv').config();
const fs = require('fs');
const { cleanEnv, str, port } = require('envalid');

const isTest = process.env.NODE_ENV === 'test';

const getSecret = (secretName, envVarName) => {
  try {
    const secretPath = `/run/secrets/${secretName}`;
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch {
    // Ignore read errors and fallback to environment variables.
  }

  return process.env[envVarName];
};

const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: port({
    default: 8080,
    desc: 'API server port',
  }),
  LOG_LEVEL: str({
    choices: ['info', 'debug', 'error', 'silent'],
    default: isTest ? 'silent' : 'info',
  }),
  CORS_ORIGIN: str({
    desc: 'Comma-separated list of allowed CORS origins',
    default: 'http://localhost:5173,http://localhost:4173,http://localhost:8080',
  }),

  JWT_SECRET: str({
    desc: 'Secret for signing tokens',
    default: getSecret('jwt_secret', 'JWT_SECRET'),
  }),
  JWT_ISSUER: str({
    desc: 'JWT issuer',
    default: process.env.JWT_ISSUER || 'prescription-api',
  }),
  JWT_AUDIENCE: str({
    desc: 'JWT audience',
    default: process.env.JWT_AUDIENCE || 'prescription-api',
  }),

  ADMIN_USER: str({
    desc: 'Admin username',
    default: isTest ? 'admin' : process.env.ADMIN_USER,
  }),
  ADMIN_PASS: str({
    desc: 'Admin password',
    default: isTest ? 'admin' : getSecret('admin_pass', 'ADMIN_PASS'),
  }),

  DB_HOST: str({ default: 'localhost' }),
  DB_USER: str({
    desc: 'Database user',
    default: isTest ? 'test' : process.env.DB_USER,
  }),
  DB_PASS: str({
    desc: 'Database password',
    default: isTest ? 'test' : getSecret('db_pass', 'DB_PASS'),
  }),
  DB_NAME: str({
    desc: 'Database name',
    default: isTest ? 'test' : process.env.DB_NAME,
  }),
});

module.exports = env;
