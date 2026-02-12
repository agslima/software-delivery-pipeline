const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const IDS = {
  adminUser: '00000000-0000-4000-8000-000000000001',
  doctorUser: '00000000-0000-4000-8000-000000000002',
  patientUser: '00000000-0000-4000-8000-000000000003',
  facility: '00000000-0000-4000-8000-000000000010',
  doctor: '00000000-0000-4000-8000-000000000020',
  patient: '00000000-0000-4000-8000-000000000030',
  encounter: '00000000-0000-4000-8000-000000000040',
  prescription: '00000000-0000-4000-8000-000000000050',
  medicationAmox: '00000000-0000-4000-8000-000000000060',
  medicationIbu: '00000000-0000-4000-8000-000000000061',
  medicationLor: '00000000-0000-4000-8000-000000000062',
  item1: '00000000-0000-4000-8000-000000000070',
  item2: '00000000-0000-4000-8000-000000000071',
  item3: '00000000-0000-4000-8000-000000000072',
  allergy: '00000000-0000-4000-8000-000000000080',
  audit: '00000000-0000-4000-8000-000000000090',
};

exports.seed = async function (knex) {
  const v2 = (table) => knex.withSchema('v2').from(table);

  await v2('prescription_items').del();
  await v2('prescriptions').del();
  await v2('allergies').del();
  await v2('encounters').del();
  await v2('medications_catalog').del();
  await v2('patients').del();
  await v2('doctors').del();
  await v2('facilities').del();
  await v2('audit_events').del();
  await v2('users').del();

  const seedValue = (key, fallback) => (process.env[key] ? process.env[key] : fallback());
  const seedAdminEmail = seedValue('SEED_ADMIN_EMAIL', () => `admin-${randomUUID()}@test.invalid`);
  const seedDoctorEmail = seedValue('SEED_DOCTOR_EMAIL', () => `doctor-${randomUUID()}@test.invalid`);
  const seedPatientEmail = seedValue('SEED_PATIENT_EMAIL', () => `patient-${randomUUID()}@test.invalid`);
  const seedPassword = seedValue('SEED_DEFAULT_PASSWORD', () => randomUUID());
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  await v2('users').insert([
    {
      id: IDS.adminUser,
      email: seedAdminEmail,
      password_hash: passwordHash,
      role: 'admin',
      mfa_enabled: false,
    },
    {
      id: IDS.doctorUser,
      email: seedDoctorEmail,
      password_hash: passwordHash,
      role: 'doctor',
      mfa_enabled: false,
    },
    {
      id: IDS.patientUser,
      email: seedPatientEmail,
      password_hash: passwordHash,
      role: 'patient',
      mfa_enabled: false,
    },
  ]);

  await v2('facilities').insert({
    id: IDS.facility,
    name: 'StayHealthy Primary Care',
    address: {
      line1: '123 Main St',
      city: 'Springfield',
      state: 'CA',
      postalCode: '12345',
    },
  });

  await v2('patients').insert({
    id: IDS.patient,
    user_id: IDS.patientUser,
    first_name: 'John',
    last_name: 'Smith',
    dob: '1980-01-15',
    gender: 'Male',
    phone: '(555) 123-4567',
    email: seedPatientEmail,
    address: {
      line1: '456 Elm St',
      city: 'Springfield',
      state: 'CA',
      postalCode: '12345',
    },
  });

  await v2('doctors').insert({
    id: IDS.doctor,
    user_id: IDS.doctorUser,
    first_name: 'Emily',
    last_name: 'Johnson',
    license_number: '12345',
    specialty: 'Family Medicine',
    phone: '(555) 987-6543',
    email: seedDoctorEmail,
  });

  await v2('encounters').insert({
    id: IDS.encounter,
    patient_id: IDS.patient,
    doctor_id: IDS.doctor,
    facility_id: IDS.facility,
    status: 'open',
    started_at: new Date('2023-07-10T09:00:00Z'),
    ended_at: null,
  });

  await v2('medications_catalog').insert([
    {
      id: IDS.medicationAmox,
      name: 'Amoxicillin',
      form: 'capsule',
      strength: '500mg',
      is_active: true,
    },
    {
      id: IDS.medicationIbu,
      name: 'Ibuprofen',
      form: 'tablet',
      strength: '200mg',
      is_active: true,
    },
    {
      id: IDS.medicationLor,
      name: 'Loratadine',
      form: 'tablet',
      strength: '10mg',
      is_active: true,
    },
  ]);

  await v2('prescriptions').insert({
    id: IDS.prescription,
    patient_id: IDS.patient,
    doctor_id: IDS.doctor,
    encounter_id: IDS.encounter,
    status: 'active',
    issued_at: new Date('2023-07-10T10:00:00Z'),
    expires_at: new Date('2023-08-10T10:00:00Z'),
    notes: 'Follow up in 2 weeks',
  });

  await v2('prescription_items').insert([
    {
      id: IDS.item1,
      prescription_id: IDS.prescription,
      medication_id: IDS.medicationAmox,
      dose: '500mg',
      route: 'oral',
      frequency: 'TID',
      duration: '10 days',
      quantity: '30 capsules',
      instructions: 'Take 1 capsule three times a day with meals.',
    },
    {
      id: IDS.item2,
      prescription_id: IDS.prescription,
      medication_id: IDS.medicationIbu,
      dose: '200mg',
      route: 'oral',
      frequency: 'q6h PRN',
      duration: 'as needed',
      quantity: '60 tablets',
      instructions: 'Take 1 tablet every 6 hours as needed for pain.',
    },
    {
      id: IDS.item3,
      prescription_id: IDS.prescription,
      medication_id: IDS.medicationLor,
      dose: '10mg',
      route: 'oral',
      frequency: 'daily',
      duration: '30 days',
      quantity: '30 tablets',
      instructions: 'Take 1 tablet once daily in the morning.',
    },
  ]);

  await v2('allergies').insert({
    id: IDS.allergy,
    patient_id: IDS.patient,
    substance: 'Penicillin',
    reaction: 'Rash',
    severity: 'high',
  });

  await v2('audit_events').insert({
    id: IDS.audit,
    actor_user_id: IDS.doctorUser,
    event_type: 'prescription_created',
    subject_type: 'prescription',
    subject_id: IDS.prescription,
    ip_address: '127.0.0.1',
    user_agent: 'seed-script',
    metadata: {
      source: 'seed',
      notes: 'demo',
    },
  });
};
