const {
  ensureDatabaseConfig,
  ensureTestDb,
  getDbConfig,
  buildDb,
  getMigrationNames,
  migrateLatest,
  migrateUp,
  resetMigrationState,
  stopTestDb,
} = require('../helpers/testDb');

jest.setTimeout(120000);

const legacyPrescription = {
  id: 'legacy-prescription-1',
  clinic_name: 'Legacy Clinic',
  date: '2026-02-01',
  doctor: {
    name: 'Dr. Ada Lovelace',
    license: 'LIC-1001',
    phone: '(555) 100-1000',
    email: 'ada@example.test',
  },
  patient: {
    name: 'Grace Hopper',
    gender: 'Female',
    dob: '1985-12-09',
    phone: '(555) 200-2000',
    email: 'grace@example.test',
  },
  medications: [
    {
      name: 'Amoxicillin',
      dosage: '500mg',
      directions: 'Take one capsule twice daily.',
      quantity: '14 capsules',
    },
  ],
};

const legacyPrescriptionRow = {
  ...legacyPrescription,
  doctor: JSON.stringify(legacyPrescription.doctor),
  patient: JSON.stringify(legacyPrescription.patient),
  medications: JSON.stringify(legacyPrescription.medications),
};

describe('Integration: database migrations', () => {
  let db;
  let testDbContext;

  beforeAll(async () => {
    testDbContext = await ensureTestDb();
    const config = getDbConfig();
    ensureDatabaseConfig(config);
    db = buildDb(config);
  });

  beforeEach(async () => {
    await resetMigrationState(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
    stopTestDb(testDbContext);
  });

  it('bootstraps a fresh schema from versioned migrations', async () => {
    const [, appliedMigrations] = await migrateLatest(db);
    const appliedRows = await db('knex_migrations').select('name').orderBy('id');
    const expectedMigrationNames = getMigrationNames();
    const auditColumns = await db.withSchema('v2').from('audit_events').columnInfo();

    expect(appliedMigrations).toEqual(expectedMigrationNames);
    expect(appliedRows.map((row) => row.name)).toEqual(expectedMigrationNames);
    await expect(db.schema.hasTable('prescriptions')).resolves.toBe(true);
    await expect(db.schema.withSchema('v2').hasTable('users')).resolves.toBe(true);
    await expect(db.schema.withSchema('v2').hasTable('refresh_tokens')).resolves.toBe(true);
    expect(auditColumns.redaction_mode).toBeDefined();
  });

  it('upgrades legacy schema data incrementally into the current model', async () => {
    await migrateUp(db, '20240101_init.js');

    await db('prescriptions').insert(legacyPrescriptionRow);

    const [, appliedMigrations] = await migrateLatest(db);
    const migratedPrescription = await db.withSchema('v2').from('prescriptions').first();
    const migratedPatient = await db.withSchema('v2').from('patients').first();
    const migratedDoctor = await db.withSchema('v2').from('doctors').first();
    const migratedItems = await db
      .withSchema('v2')
      .from('prescription_items')
      .where({ prescription_id: migratedPrescription.id });
    const refreshTokenTableExists = await db.schema.withSchema('v2').hasTable('refresh_tokens');
    const auditColumns = await db.withSchema('v2').from('audit_events').columnInfo();

    expect(appliedMigrations).toContain('20260203_phase2_tables.js');
    expect(appliedMigrations).toContain('20260205_refresh_tokens.js');
    expect(appliedMigrations).toContain('20260209_audit_pipeline_updates.js');
    expect(migratedPrescription).toMatchObject({
      status: 'active',
      notes: legacyPrescription.clinic_name,
    });
    expect(migratedPatient.email).toBe(legacyPrescription.patient.email);
    expect(migratedDoctor.license_number).toBe(legacyPrescription.doctor.license);
    expect(migratedItems).toHaveLength(1);
    expect(migratedItems[0].quantity).toBe(legacyPrescription.medications[0].quantity);
    expect(refreshTokenTableExists).toBe(true);
    expect(auditColumns.redaction_mode).toBeDefined();
  });
});
