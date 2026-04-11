const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

let secretsJsonCache;

const readSecretFile = (secretPath) => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(secretPath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch {
    // Ignore secret file access errors and fall back to environment variables.
  }

  return undefined;
};

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

const readSecret = (secretName, envVar) => {
  const fileFromEnv = process.env[`${envVar}_FILE`];
  if (fileFromEnv) {
    const value = readSecretFile(fileFromEnv);
    if (value) return value;
  }

  const secretPath = `/run/secrets/${secretName}`;
  const secretValue = readSecretFile(secretPath);
  if (secretValue) return secretValue;

  const secretsJson = loadSecretsJson();
  if (secretsJson && typeof secretsJson === 'object') {
    if (secretsJson[envVar]) return String(secretsJson[envVar]);
    if (secretsJson[secretName]) return String(secretsJson[secretName]);
  }

  return process.env[envVar];
};

const getConnectionConfig = (overrides = {}) => ({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER,
  password: readSecret('db_pass', 'DB_PASS'),
  database: process.env.DB_NAME,
  ...overrides,
});

const createKnexConfig = (overrides = {}) => {
  const baseConfig = {
    client: 'pg',
    connection: getConnectionConfig(),
    pool: { min: 2, max: 10 },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
  };

  return {
    ...baseConfig,
    ...overrides,
    connection: getConnectionConfig(overrides.connection),
    pool: overrides.pool || baseConfig.pool,
    migrations: {
      ...baseConfig.migrations,
      ...overrides.migrations,
    },
    seeds: {
      ...baseConfig.seeds,
      ...overrides.seeds,
    },
  };
};

module.exports = {
  createKnexConfig,
  getConnectionConfig,
};
