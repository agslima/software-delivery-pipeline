const {
  ensureDatabaseConfig,
  ensureTestDb,
  getDbConfig,
  buildDb,
  migrateLatest,
  stopTestDb,
} = require('../helpers/testDb');

const defaultSuiteTimeoutMs = 120000;
const suiteTimeoutMs = Number(process.env.AUDIT_REPOSITORY_TEST_TIMEOUT_MS || defaultSuiteTimeoutMs);

jest.setTimeout(suiteTimeoutMs);

const baseEnv = { ...process.env };

const testRunId = `audit_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const eventTypes = [];
const actorUsers = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    email: `${testRunId}_actor1@example.test`,
    role: 'doctor',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    email: `${testRunId}_actor2@example.test`,
    role: 'doctor',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    email: `${testRunId}_actor3@example.test`,
    role: 'doctor',
  },
];

let db;
let AuditRepository;
let AuditService;
let testDbContext = null;

const cleanupEvents = async () => {
  if (!db || eventTypes.length === 0) return;
  await db.withSchema('v2').from('audit_events').whereIn('event_type', eventTypes).del();
};

const seedActorUsers = async () => {
  if (!db) return;
  await db.withSchema('v2').from('users').insert(
    actorUsers.map((user) => ({
      id: user.id,
      email: user.email,
      password_hash: 'test-password-hash',
      role: user.role,
      mfa_enabled: false,
    }))
  );
};

const cleanupActorUsers = async () => {
  if (!db) return;
  await db.withSchema('v2').from('users').whereIn('id', actorUsers.map((user) => user.id)).del();
};

describe('Integration: Audit repository storage and queries', () => {
  beforeAll(async () => {
    process.env.AUDIT_SINK = 'db';
    process.env.AUDIT_PII_REDACTION = 'none';
    try {
      testDbContext = await ensureTestDb();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Unable to start integration database for audit.repository.test. ` +
          `Start it with app/scripts/test-db-compose.sh up or set TEST_DB_HOST/PORT/USER/PASS/NAME. ` +
          `Details: ${message}`
      );
    }
    const config = getDbConfig();
    ensureDatabaseConfig(config);
    db = buildDb(config);
    jest.doMock('../../src/infra/db/knex', () => db);
    jest.isolateModules(() => {
      ({ AuditRepository } = require('../../src/infra/v2/audit.repository'));
      ({ AuditService } = require('../../src/core/v2/audit.service'));
    });
    await migrateLatest(db);
    await seedActorUsers();
  });

  afterAll(async () => {
    await cleanupEvents();
    await cleanupActorUsers();
    if (db) await db.destroy();
    stopTestDb(testDbContext);
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
