require('dotenv').config();
const fs = require('fs');
const { cleanEnv, str, port, num } = require('envalid');

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

  DATA_ENCRYPTION_KEY: str({
    desc: 'Key used for field-level encryption',
    default: isTest ? 'test-data-encryption-key' : getSecret('data_encryption_key', 'DATA_ENCRYPTION_KEY'),
  }),

  TLS_CERT_PATH: str({
    desc: 'Optional TLS certificate path',
    default: process.env.TLS_CERT_PATH || '',
  }),
  TLS_KEY_PATH: str({
    desc: 'Optional TLS key path',
    default: process.env.TLS_KEY_PATH || '',
  }),

  LOGIN_MAX_FAILURES: num({
    desc: 'Max failed login attempts before temporary lockout',
    default: 5,
  }),
  LOGIN_LOCK_MINUTES: num({
    desc: 'Lockout duration in minutes after too many failed attempts',
    default: 15,
  }),
  LOGIN_FAILURE_WINDOW_MINUTES: num({
    desc: 'Rolling window for failed login attempts (minutes)',
    default: 15,
  }),
});

module.exports = env;
