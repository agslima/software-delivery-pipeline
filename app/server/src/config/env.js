require('dotenv').config();
const fs = require('fs');
const { randomBytes } = require('crypto');
const { cleanEnv, str, port, num, bool } = require('envalid');

const isTest = process.env.NODE_ENV === 'test';

const ensureTestSecret = (key, bytes = 32) => {
  if (isTest && !process.env[key]) {
    process.env[key] = randomBytes(bytes).toString('hex');
  }
};

ensureTestSecret('JWT_SECRET', 32);
ensureTestSecret('ADMIN_PASS', 16);
ensureTestSecret('DB_PASS', 16);
ensureTestSecret('DATA_ENCRYPTION_KEY', 32);

let secretsJsonCache;

const loadSecretsJson = () => {
  if (secretsJsonCache !== undefined) return secretsJsonCache;
  const raw = process.env.SECRETS_JSON;
  if (!raw) {
    secretsJsonCache = null;
    return secretsJsonCache;
  }
  try {
    secretsJsonCache = JSON.parse(raw);
  } catch {
    secretsJsonCache = null;
  }
  return secretsJsonCache;
};

const readSecretFile = (secretPath) => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(secretPath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch {
    // Ignore read errors and fallback to environment variables.
  }

  return undefined;
};

const getSecret = (secretName, envVarName) => {
  const fileFromEnv = process.env[`${envVarName}_FILE`];
  if (fileFromEnv) {
    const value = readSecretFile(fileFromEnv);
    if (value) return value;
  }

  try {
    const secretPath = `/run/secrets/${secretName}`;
    const value = readSecretFile(secretPath);
    if (value) return value;
  } catch {
    // Ignore read errors and fallback to environment variables.
  }

  const secretsJson = loadSecretsJson();
  if (secretsJson && typeof secretsJson === 'object') {
    if (secretsJson[envVarName]) return String(secretsJson[envVarName]);
    if (secretsJson[secretName]) return String(secretsJson[secretName]);
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
  ACCESS_TOKEN_TTL_MINUTES: num({
    desc: 'Access token time-to-live in minutes',
    default: 15,
  }),

  OIDC_ENABLED: bool({
    desc: 'Enable OIDC token validation',
    default: false,
  }),
  OIDC_REQUIRED: bool({
    desc: 'Require OIDC tokens for API access',
    default: false,
  }),
  OIDC_ISSUER: str({
    desc: 'OIDC issuer',
    default: process.env.OIDC_ISSUER || '',
  }),
  OIDC_AUDIENCE: str({
    desc: 'OIDC audience (client ID or API audience)',
    default: process.env.OIDC_AUDIENCE || '',
  }),
  OIDC_JWKS_URI: str({
    desc: 'OIDC JWKS URI',
    default: process.env.OIDC_JWKS_URI || '',
  }),
  OIDC_EMAIL_CLAIM: str({
    desc: 'OIDC claim name for email',
    default: process.env.OIDC_EMAIL_CLAIM || 'email',
  }),
  OIDC_ROLE_CLAIM: str({
    desc: 'OIDC claim name for roles',
    default: process.env.OIDC_ROLE_CLAIM || 'roles',
  }),
  OIDC_MFA_REQUIRED_ROLES: str({
    desc: 'Comma-separated roles that require MFA via OIDC amr/acr claims',
    default: process.env.OIDC_MFA_REQUIRED_ROLES || 'doctor,admin',
  }),
  OIDC_REQUIRED_AMR: str({
    desc: 'Comma-separated amr values required for MFA-protected roles',
    default: process.env.OIDC_REQUIRED_AMR || 'mfa',
  }),
  OIDC_REQUIRED_ACR: str({
    desc: 'Comma-separated acr values required for MFA-protected roles',
    default: process.env.OIDC_REQUIRED_ACR || '',
  }),
  OIDC_CLOCK_TOLERANCE_SECONDS: num({
    desc: 'OIDC clock tolerance in seconds',
    default: 5,
  }),

  AUDIT_SINK: str({
    desc: 'Audit log sink (db or console)',
    default: process.env.AUDIT_SINK || 'db',
  }),
  AUDIT_PII_REDACTION: str({
    desc: 'Audit metadata redaction mode',
    default: process.env.AUDIT_PII_REDACTION || 'none',
  }),

  METRICS_ENABLED: bool({
    desc: 'Enable Prometheus metrics endpoint',
    default: process.env.METRICS_ENABLED ? process.env.METRICS_ENABLED === 'true' : false,
  }),
  METRICS_PATH: str({
    desc: 'Path for metrics endpoint',
    default: process.env.METRICS_PATH || '/metrics',
  }),
  METRICS_AUTH_TOKEN: str({
    desc: 'Optional bearer token for metrics endpoint',
    default: process.env.METRICS_AUTH_TOKEN || '',
  }),

  ADMIN_USER: str({
    desc: 'Admin username',
    default: isTest ? 'admin' : process.env.ADMIN_USER,
  }),
  ADMIN_PASS: str({
    desc: 'Admin password',
    default: getSecret('admin_pass', 'ADMIN_PASS'),
  }),

  DB_HOST: str({ default: 'localhost' }),
  DB_USER: str({
    desc: 'Database user',
    default: isTest ? 'test' : process.env.DB_USER,
  }),
  DB_PASS: str({
    desc: 'Database password',
    default: getSecret('db_pass', 'DB_PASS'),
  }),
  DB_NAME: str({
    desc: 'Database name',
    default: isTest ? 'test' : process.env.DB_NAME,
  }),

  DATA_ENCRYPTION_KEY: str({
    desc: 'Key used for field-level encryption',
    default: getSecret('data_encryption_key', 'DATA_ENCRYPTION_KEY'),
  }),
  DATA_ENCRYPTION_KEY_ID: str({
    desc: 'Primary key identifier for field-level encryption',
    default: process.env.DATA_ENCRYPTION_KEY_ID || 'v1',
  }),
  DATA_ENCRYPTION_KEYS: str({
    desc: 'Optional key ring for field-level encryption (keyId:secret,keyId2:secret2)',
    default: process.env.DATA_ENCRYPTION_KEYS || '',
  }),

  TLS_CERT_PATH: str({
    desc: 'Optional TLS certificate path',
    default: process.env.TLS_CERT_PATH || '',
  }),
  TLS_KEY_PATH: str({
    desc: 'Optional TLS key path',
    default: process.env.TLS_KEY_PATH || '',
  }),
  ENFORCE_TLS: bool({
    desc: 'Reject non-TLS requests when behind a proxy',
    default: process.env.ENFORCE_TLS ? process.env.ENFORCE_TLS === 'true' : false,
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

  REFRESH_TOKEN_TTL_DAYS: num({
    desc: 'Refresh token time-to-live in days',
    default: 7,
  }),
  MFA_TOKEN_TTL_MINUTES: num({
    desc: 'MFA token time-to-live in minutes',
    default: 5,
  }),
});

module.exports = env;
