const fs = require('fs');
const knex = require('knex');
const { execSync, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const { createKnexConfig } = require('../../src/infra/db/knex-config');

const appDir = path.resolve(__dirname, '../../..');
const composeFile = path.join(appDir, 'docker-compose.test-db.yml');
const migrationDirectory = createKnexConfig().migrations.directory;

const dockerAvailable = () => {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const execCompose = (args, envOverrides = {}) => {
  const env = { ...process.env, ...envOverrides };
  const programArgs = ['compose', '-f', composeFile, ...args];
  const result = spawnSync('docker', programArgs, { encoding: 'utf8', env });
  if (!result.error) {
    if (typeof result.status === 'number' && result.status === 0) {
      return;
    }
    throw new Error(`docker compose failed.\n${result.stderr || result.stdout || 'No stderr output.'}`);
  }

  if (result.error.code !== 'ENOENT') {
    throw result.error;
  }

  const legacyArgs = ['-f', composeFile, ...args];
  const legacy = spawnSync('docker-compose', legacyArgs, { encoding: 'utf8', env });
  if (!legacy.error && typeof legacy.status === 'number' && legacy.status === 0) {
    return;
  }

  throw new Error(`docker-compose failed.\n${legacy.stderr || legacy.stdout || 'No stderr output.'}`);
};

const waitForDb = async (envOverrides) => {
  const waitSeconds = Number(process.env.TEST_DB_WAIT_SECONDS || 60);
  const maxAttempts = Number.isFinite(waitSeconds) && waitSeconds > 0 ? waitSeconds : 60;
  const stableChecks = Number(process.env.TEST_DB_STABLE_CHECKS || 3);
  const requiredStableChecks = Number.isFinite(stableChecks) && stableChecks > 0 ? stableChecks : 3;
  let readyStreak = 0;

  const canConnectFromHost = async () => {
    const probe = buildDb({
      host: process.env.TEST_DB_HOST || 'localhost',
      user: envOverrides.TEST_DB_USER,
      password: envOverrides.TEST_DB_PASS,
      database: envOverrides.TEST_DB_NAME,
      port: envOverrides.TEST_DB_PORT,
    });

    try {
      await probe.raw('select 1');
      return true;
    } catch {
      return false;
    } finally {
      await probe.destroy().catch(() => {});
    }
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      execCompose(
        ['exec', '-T', 'test-postgres', 'pg_isready', '-U', envOverrides.TEST_DB_USER, '-d', envOverrides.TEST_DB_NAME],
        envOverrides
      );
      const hostReady = await canConnectFromHost();
      if (hostReady) {
        readyStreak += 1;
        if (readyStreak >= requiredStableChecks) {
          return true;
        }
      } else {
        readyStreak = 0;
      }
    } catch {
      readyStreak = 0;
      await delay(1000);
      continue;
    }

    await delay(1000);
  }

  return false;
};

const ensureTestDb = async () => {
  if (process.env.TEST_DB_HOST) {
    return { autoStarted: false, composeProject: null };
  }

  if (!dockerAvailable()) {
    throw new Error('Docker is required to auto-start the test database.');
  }

  const composeProject = `test-db-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const envOverrides = {
    COMPOSE_PROJECT_NAME: composeProject,
    TEST_DB_PORT: process.env.TEST_DB_PORT || '5433',
    TEST_DB_USER: process.env.TEST_DB_USER || 'postgres',
    TEST_DB_PASS: process.env.TEST_DB_PASS || randomBytes(16).toString('hex'),
    TEST_DB_NAME: process.env.TEST_DB_NAME || 'prescriptions_test',
  };

  const preferredPort = envOverrides.TEST_DB_PORT;
  const fallbackPorts = process.env.TEST_DB_PORT
    ? [preferredPort]
    : [preferredPort, '5434', '5435', '5436', '5437', '5438', '5439'];
  let lastError = null;

  for (const port of fallbackPorts) {
    envOverrides.TEST_DB_PORT = port;
    try {
      execCompose(['up', '-d'], envOverrides);
      if (!(await waitForDb(envOverrides))) {
        execCompose(['logs', 'test-postgres'], envOverrides);
        throw new Error('Test database did not become ready in time.');
      }
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      try {
        execCompose(['down', '-v'], envOverrides);
      } catch {
        // Ignore cleanup errors from failed startup attempts.
      }

      if (process.env.TEST_DB_PORT) {
        break;
      }

      if (!String(error?.message || '').includes('port is already allocated')) {
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  process.env.TEST_DB_HOST = 'localhost';
  process.env.TEST_DB_PORT = envOverrides.TEST_DB_PORT;
  process.env.TEST_DB_USER = envOverrides.TEST_DB_USER;
  process.env.TEST_DB_PASS = envOverrides.TEST_DB_PASS;
  process.env.TEST_DB_NAME = envOverrides.TEST_DB_NAME;

  return {
    autoStarted: true,
    composeProject,
  };
};

const stopTestDb = (context) => {
  if (!context?.autoStarted || !context.composeProject) return;
  execCompose(['down', '-v'], { COMPOSE_PROJECT_NAME: context.composeProject });
};

const getDbConfig = () => ({
  host: process.env.TEST_DB_HOST || process.env.DB_HOST,
  port: process.env.TEST_DB_PORT || process.env.DB_PORT,
  user: process.env.TEST_DB_USER || process.env.DB_USER,
  password: process.env.TEST_DB_PASS || process.env.DB_PASS,
  database: process.env.TEST_DB_NAME || process.env.DB_NAME,
});

const ensureDatabaseConfig = (config) => {
  const required = ['host', 'user', 'password', 'database'];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing database env vars for DB-backed tests. Set TEST_DB_HOST/USER/PASS/NAME (preferred) or DB_HOST/USER/PASS/NAME. Missing: ${missing.join(
        ', '
      )}`
    );
  }
};

const buildDb = (config) =>
  knex(
    createKnexConfig({
      connection: {
        host: config.host,
        port: config.port ? Number(config.port) : undefined,
        user: config.user,
        password: config.password,
        database: config.database,
      },
      pool: { min: 0, max: 4 },
    })
  );

const resetMigrationState = async (db) => {
  await db.raw('DROP SCHEMA IF EXISTS v2 CASCADE');
  await db.raw('DROP TABLE IF EXISTS prescriptions CASCADE');
  await db.raw('DROP TABLE IF EXISTS knex_migrations_lock CASCADE');
  await db.raw('DROP TABLE IF EXISTS knex_migrations CASCADE');
};

const migrateLatest = async (db) => db.migrate.latest();

const migrateUp = async (db, name) => db.migrate.up({ name });

const getMigrationNames = () =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs
    .readdirSync(migrationDirectory)
    .filter((entry) => entry.endsWith('.js'))
    .sort();

module.exports = {
  ensureDatabaseConfig,
  ensureTestDb,
  getDbConfig,
  buildDb,
  getMigrationNames,
  migrateLatest,
  migrateUp,
  resetMigrationState,
  stopTestDb,
};
