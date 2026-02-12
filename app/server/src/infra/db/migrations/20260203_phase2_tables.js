const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');

const SCHEMA = 'v2';

const splitName = (fullName) => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: 'Unknown', lastName: 'Unknown' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Unknown' };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

exports.up = async function (knex) {
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);

  await knex.schema.withSchema(SCHEMA).createTable('users', (table) => {
    table.uuid('id').primary();
    table.text('email').notNullable().unique();
    table.text('password_hash').notNullable();
    table.enu('role', ['doctor', 'patient', 'admin'], { useNative: false }).notNullable();
    table.boolean('mfa_enabled').notNullable().defaultTo(false);
    table.text('mfa_secret');
    table.timestamps(true, true);
  });

  await knex.schema.withSchema(SCHEMA).createTable('facilities', (table) => {
    table.uuid('id').primary();
    table.text('name').notNullable();
    table.jsonb('address');
    table.timestamps(true, true);
  });

  await knex.schema.withSchema(SCHEMA).createTable('patients', (table) => {
    table.uuid('id').primary();
    table
      .uuid('user_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable(`${SCHEMA}.users`)
      .onDelete('RESTRICT');
    table.text('first_name').notNullable();
    table.text('last_name').notNullable();
    table.date('dob');
    table.text('gender');
    table.text('phone');
    table.text('email');
    table.jsonb('address');
    table.timestamps(true, true);
    table.index(['dob', 'last_name']);
  });

  await knex.schema.withSchema(SCHEMA).createTable('doctors', (table) => {
    table.uuid('id').primary();
    table
      .uuid('user_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable(`${SCHEMA}.users`)
      .onDelete('RESTRICT');
    table.text('first_name').notNullable();
    table.text('last_name').notNullable();
    table.text('license_number').notNullable().unique();
    table.text('specialty');
    table.text('phone');
    table.text('email');
    table.timestamps(true, true);
  });

  await knex.schema.withSchema(SCHEMA).createTable('encounters', (table) => {
    table.uuid('id').primary();
    table
      .uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.patients`)
      .onDelete('RESTRICT');
    table
      .uuid('doctor_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.doctors`)
      .onDelete('RESTRICT');
    table
      .uuid('facility_id')
      .nullable()
      .references('id')
      .inTable(`${SCHEMA}.facilities`)
      .onDelete('RESTRICT');
    table.enu('status', ['open', 'closed'], { useNative: false }).notNullable().defaultTo('open');
    table.timestamp('started_at', { useTz: true });
    table.timestamp('ended_at', { useTz: true });
    table.timestamps(true, true);
    table.index(['patient_id', 'status']);
  });

  await knex.schema.withSchema(SCHEMA).createTable('allergies', (table) => {
    table.uuid('id').primary();
    table
      .uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.patients`)
      .onDelete('RESTRICT');
    table.text('substance').notNullable();
    table.text('reaction');
    table.enu('severity', ['low', 'moderate', 'high'], { useNative: false }).notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.withSchema(SCHEMA).createTable('medications_catalog', (table) => {
    table.uuid('id').primary();
    table.text('name').notNullable().unique();
    table.text('rxnorm_code');
    table.text('form');
    table.text('strength');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  await knex.schema.withSchema(SCHEMA).createTable('prescriptions', (table) => {
    table.uuid('id').primary();
    table
      .uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.patients`)
      .onDelete('RESTRICT');
    table
      .uuid('doctor_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.doctors`)
      .onDelete('RESTRICT');
    table
      .uuid('encounter_id')
      .nullable()
      .references('id')
      .inTable(`${SCHEMA}.encounters`)
      .onDelete('RESTRICT');
    table
      .enu('status', ['active', 'completed', 'cancelled'], { useNative: false })
      .notNullable()
      .defaultTo('active');
    table.timestamp('issued_at', { useTz: true }).notNullable();
    table.timestamp('expires_at', { useTz: true });
    table.text('notes');
    table.timestamps(true, true);
    table.index(['patient_id', 'issued_at']);
  });

  await knex.schema.withSchema(SCHEMA).createTable('prescription_items', (table) => {
    table.uuid('id').primary();
    table
      .uuid('prescription_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.prescriptions`)
      .onDelete('RESTRICT');
    table
      .uuid('medication_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.medications_catalog`)
      .onDelete('RESTRICT');
    table.text('dose');
    table.text('route');
    table.text('frequency');
    table.text('duration');
    table.text('quantity');
    table.text('instructions');
    table.timestamps(true, true);
  });

  await knex.schema.withSchema(SCHEMA).createTable('audit_events', (table) => {
    table.uuid('id').primary();
    table
      .uuid('actor_user_id')
      .notNullable()
      .references('id')
      .inTable(`${SCHEMA}.users`)
      .onDelete('RESTRICT');
    table.text('event_type').notNullable();
    table.text('subject_type').notNullable();
    table.uuid('subject_id').notNullable();
    table.text('ip_address');
    table.text('user_agent');
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  const legacyTableExists = await knex.schema.hasTable('prescriptions');
  if (!legacyTableExists) return;

  const legacyRows = await knex('prescriptions').select(
    'id',
    'clinic_name',
    'date',
    'doctor',
    'patient',
    'medications'
  );

  if (!legacyRows.length) return;

  const v2 = knex.withSchema(SCHEMA);
  const medicationCache = new Map();

  for (const row of legacyRows) {
    const doctor = row.doctor || {};
    const patient = row.patient || {};

    const doctorEmail = doctor.email || `legacy-${randomUUID()}@example.com`;
    const patientEmail = patient.email || `legacy-${randomUUID()}@example.com`;
    const doctorLicense = doctor.license || `legacy-${randomUUID()}`;
    const legacyPasswordHash = await bcrypt.hash(randomUUID(), 10);

    let doctorUser = await v2('users').where({ email: doctorEmail }).first();
    if (!doctorUser) {
      const doctorUserId = randomUUID();
      await v2('users').insert({
        id: doctorUserId,
        email: doctorEmail,
        password_hash: legacyPasswordHash,
        role: 'doctor',
        mfa_enabled: false,
      });
      doctorUser = { id: doctorUserId };
    }

    let patientUser = await v2('users').where({ email: patientEmail }).first();
    if (!patientUser) {
      const patientUserId = randomUUID();
      await v2('users').insert({
        id: patientUserId,
        email: patientEmail,
        password_hash: legacyPasswordHash,
        role: 'patient',
        mfa_enabled: false,
      });
      patientUser = { id: patientUserId };
    }

    let doctorRecord = await v2('doctors').where({ license_number: doctorLicense }).first();
    if (!doctorRecord) {
      const doctorId = randomUUID();
      const doctorName = splitName(doctor.name);
      await v2('doctors').insert({
        id: doctorId,
        user_id: doctorUser.id,
        first_name: doctorName.firstName,
        last_name: doctorName.lastName,
        license_number: doctorLicense,
        phone: doctor.phone || null,
        email: doctorEmail,
      });
      doctorRecord = { id: doctorId };
    }

    let patientRecord = await v2('patients').where({ user_id: patientUser.id }).first();
    if (!patientRecord) {
      const patientId = randomUUID();
      const patientName = splitName(patient.name);
      await v2('patients').insert({
        id: patientId,
        user_id: patientUser.id,
        first_name: patientName.firstName,
        last_name: patientName.lastName,
        dob: toDateOrNull(patient.dob),
        gender: patient.gender || null,
        phone: patient.phone || null,
        email: patientEmail,
      });
      patientRecord = { id: patientId };
    }

    const prescriptionId = randomUUID();
    const issuedAt = toDateOrNull(row.date) || new Date();

    await v2('prescriptions').insert({
      id: prescriptionId,
      patient_id: patientRecord.id,
      doctor_id: doctorRecord.id,
      status: 'active',
      issued_at: issuedAt,
      notes: row.clinic_name || null,
    });

    const meds = Array.isArray(row.medications) ? row.medications : [];
    for (const med of meds) {
      const medName = med.name || 'Unknown';
      let medicationId = medicationCache.get(medName);

      if (!medicationId) {
        const existingMed = await v2('medications_catalog').where({ name: medName }).first();
        if (existingMed) {
          medicationId = existingMed.id;
        } else {
          medicationId = randomUUID();
          await v2('medications_catalog').insert({
            id: medicationId,
            name: medName,
            strength: med.dosage || null,
            is_active: true,
          });
        }
        medicationCache.set(medName, medicationId);
      }

      await v2('prescription_items').insert({
        id: randomUUID(),
        prescription_id: prescriptionId,
        medication_id: medicationId,
        dose: med.dosage || null,
        quantity: med.quantity || null,
        instructions: med.directions || null,
      });
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('audit_events');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('prescription_items');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('prescriptions');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('medications_catalog');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('allergies');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('encounters');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('doctors');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('patients');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('facilities');
  await knex.schema.withSchema(SCHEMA).dropTableIfExists('users');
  await knex.raw(`DROP SCHEMA IF EXISTS ${SCHEMA}`);
};
