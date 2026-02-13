const knex = require('knex');
const { execSync, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const shellQuote = require('shell-quote');

jest.setTimeout(30000);

const baseEnv = { ...process.env };

const testRunId = `audit_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const eventTypes = [];

let db;
let AuditRepository;
let AuditService;
let autoStarted = false;
let composeProject = null;

const appDir = path.resolve(__dirname, '../..');
const composeFile = path.join(appDir, 'docker-compose.test-db.yml');
const defaultTestDbPass = randomBytes(16).toString('hex');

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
  const cmd = `docker compose -f "${composeFile}" ${args}`;
  const parsed = shellQuote.parse(cmd);
  const program = parsed[0];
  const programArgs = parsed.slice(1);
  const result = spawnSync(program, programArgs, { stdio: 'ignore', env });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`Command "${cmd}" exited with status ${result.status}`);
  }
};

const waitForDb = (envOverrides) => {
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      execCompose(
        `exec -T test-postgres pg_isready -U "${envOverrides.TEST_DB_USER}" -d "${envOverrides.TEST_DB_NAME}"`,
        envOverrides
      );
      return true;
    } catch {
      // retry
    }
  }
  return false;
};

const startTestDb = () => {
  if (!dockerAvailable()) {
    throw new Error('Docker is required to auto-start the test database.');
  }

  composeProject = `audit-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const envOverrides = {
    COMPOSE_PROJECT_NAME: composeProject,
    TEST_DB_PORT: process.env.TEST_DB_PORT || '5433',
    TEST_DB_USER: process.env.TEST_DB_USER || 'postgres',
    TEST_DB_PASS: process.env.TEST_DB_PASS || defaultTestDbPass,
    TEST_DB_NAME: process.env.TEST_DB_NAME || 'prescriptions_test',
  };

  execCompose('up -d', envOverrides);

  if (!waitForDb(envOverrides)) {
    execCompose('logs test-postgres', envOverrides);
    throw new Error('Test database did not become ready in time.');
  }

  process.env.TEST_DB_HOST = process.env.TEST_DB_HOST || 'localhost';
  process.env.TEST_DB_PORT = envOverrides.TEST_DB_PORT;
  process.env.TEST_DB_USER = envOverrides.TEST_DB_USER;
  process.env.TEST_DB_PASS = envOverrides.TEST_DB_PASS;
  process.env.TEST_DB_NAME = envOverrides.TEST_DB_NAME;
  autoStarted = true;
};

const stopTestDb = () => {
  if (!autoStarted || !composeProject) return;
  execCompose('down -v', { COMPOSE_PROJECT_NAME: composeProject });
};

const getDbConfig = () => ({
  host: process.env.TEST_DB_HOST || process.env.DB_HOST,
  user: process.env.TEST_DB_USER || process.env.DB_USER,
  password: process.env.TEST_DB_PASS || process.env.DB_PASS,
  database: process.env.TEST_DB_NAME || process.env.DB_NAME,
  port: process.env.TEST_DB_PORT || process.env.DB_PORT,
});

const ensureDatabaseConfig = (config) => {
  const required = ['host', 'user', 'password', 'database'];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing database env vars for audit integration test. Set TEST_DB_HOST/USER/PASS/NAME (preferred) or DB_HOST/USER/PASS/NAME. Missing: ${missing.join(
        ', '
      )}`
    );
  }
};

const buildDb = (config) =>
  knex({
    client: 'pg',
    connection: {
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port ? Number(config.port) : undefined,
    },
    pool: { min: 0, max: 4 },
  });

const ensureAuditTable = async () => {
  await db.raw('CREATE SCHEMA IF NOT EXISTS v2');
  const hasTable = await db.schema.withSchema('v2').hasTable('audit_events');
  if (!hasTable) {
    await db.schema.withSchema('v2').createTable('audit_events', (table) => {
      table.uuid('id').primary();
      table.uuid('actor_user_id').notNullable();
      table.text('event_type').notNullable();
      table.text('subject_type').notNullable();
      table.uuid('subject_id').notNullable();
      table.text('ip_address');
      table.text('user_agent');
      table.text('redaction_mode');
      table.jsonb('metadata');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
  }
};

const cleanupEvents = async () => {
  if (!db || eventTypes.length === 0) return;
  await db.withSchema('v2').from('audit_events').whereIn('event_type', eventTypes).del();
};

describe('Integration: Audit repository storage and queries', () => {
  beforeAll(async () => {
    process.env.AUDIT_SINK = 'db';
    process.env.AUDIT_PII_REDACTION = 'none';
    if (!process.env.TEST_DB_HOST) {
      startTestDb();
    }
    const config = getDbConfig();
    ensureDatabaseConfig(config);
    db = buildDb(config);
    jest.doMock('../../src/infra/db/knex', () => db);
    jest.isolateModules(() => {
      ({ AuditRepository } = require('../../src/infra/v2/audit.repository'));
      ({ AuditService } = require('../../src/core/v2/audit.service'));
    });
    await ensureAuditTable();
  });

  afterAll(async () => {
    await cleanupEvents();
    if (db) await db.destroy();
    stopTestDb();
    Object.keys(process.env).forEach((key) => {
      if (!(key in baseEnv)) delete process.env[key];
    });
    Object.assign(process.env, baseEnv);
  });

  it('stores audit events and returns them via list', async () => {
    const repository = new AuditRepository();
    const service = new AuditService({ auditRepository: repository });
    const eventType = `${testRunId}_login_success`;
    eventTypes.push(eventType);

    const result = await service.logEvent({
      actorUserId: '11111111-1111-4111-8111-111111111111',
      eventType,
      subjectType: 'user',
      subjectId: '22222222-2222-4222-8222-222222222222',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      metadata: { requestId: 'req-1' },
      redactionMode: 'strict',
    });

    const rows = await repository.list({ eventType });

    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe(eventType);
    expect(rows[0].actor_user_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(rows[0].redaction_mode).toBe('strict');
    expect(result).toBeDefined();
  });

  it('supports query filters, ordering, and pagination', async () => {
    const repository = new AuditRepository();
    const eventType = `${testRunId}_patient_view`;
    const otherEventType = `${testRunId}_prescription_view`;
    eventTypes.push(eventType, otherEventType);

    const now = new Date('2026-02-09T10:00:00Z');
    await repository.create({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actor_user_id: '33333333-3333-4333-8333-333333333333',
      event_type: eventType,
      subject_type: 'patient',
      subject_id: '44444444-4444-4444-8444-444444444444',
      ip_address: '10.0.0.1',
      user_agent: 'ua',
      metadata: { requestId: 'r1' },
      redaction_mode: 'none',
      created_at: new Date(now.getTime() - 1000),
    });
    await repository.create({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      actor_user_id: '55555555-5555-4555-8555-555555555555',
      event_type: eventType,
      subject_type: 'patient',
      subject_id: '66666666-6666-4666-8666-666666666666',
      ip_address: '10.0.0.2',
      user_agent: 'ua',
      metadata: { requestId: 'r2' },
      redaction_mode: 'none',
      created_at: new Date(now.getTime()),
    });
    await repository.create({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      actor_user_id: '33333333-3333-4333-8333-333333333333',
      event_type: otherEventType,
      subject_type: 'prescription',
      subject_id: '77777777-7777-4777-8777-777777777777',
      ip_address: '10.0.0.3',
      user_agent: 'ua',
      metadata: { requestId: 'r3' },
      redaction_mode: 'none',
      created_at: new Date(now.getTime() - 5000),
    });

    const filtered = await repository.list({ eventType, limit: 10, offset: 0 });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

    const paged = await repository.list({ eventType, limit: 1, offset: 1 });
    expect(paged).toHaveLength(1);
    expect(paged[0].id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    const actorFiltered = await repository.list({
      actorUserId: '33333333-3333-4333-8333-333333333333',
      limit: 10,
      offset: 0,
    });
    expect(actorFiltered.map((row) => row.id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]);
  });
});
