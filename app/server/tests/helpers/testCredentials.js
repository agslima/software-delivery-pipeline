const { randomUUID, randomBytes } = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const buildTestId = () => randomUUID();

const buildTestEmail = (label = 'user') => `${label}-${randomUUID()}@test.invalid`;

const buildTestPassword = (label = 'pwd') => `${label}-${randomUUID()}!`;

const buildBase32Secret = (length = 32) => {
  const bytes = randomBytes(length);
  let output = '';
  for (const byte of bytes) {
    output += BASE32_ALPHABET[byte % BASE32_ALPHABET.length];
  }
  return output;
};

const buildTestUser = (role = 'user') => ({
  id: buildTestId(),
  email: buildTestEmail(role),
  role,
  mfa_enabled: false,
});

const buildTestEnv = () => ({
  NODE_ENV: 'test',
  ADMIN_USER: `admin-${randomUUID()}`,
  ADMIN_PASS: buildTestPassword('admin'),
  JWT_SECRET: randomBytes(32).toString('hex'),
  LOG_LEVEL: 'silent',
  CORS_ORIGIN: 'http://localhost',
  DB_HOST: 'localhost',
  DB_USER: `dbuser-${randomUUID()}`,
  DB_PASS: randomBytes(16).toString('hex'),
  DB_NAME: `db-${randomUUID()}`,
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});

const applyTestEnv = (overrides = {}) => {
  const env = { ...buildTestEnv(), ...overrides };
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = String(value);
  });
  return env;
};

module.exports = {
  buildTestId,
  buildTestEmail,
  buildTestPassword,
  buildBase32Secret,
  buildTestUser,
  buildTestEnv,
  applyTestEnv,
};
