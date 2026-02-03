const request = require('supertest');

const auditEvents = [];

const doctorUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const doctorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const patientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const encounterId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const prescriptionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const medicationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const mockPatient = {
  id: patientId,
  user_id: '11111111-1111-4111-8111-111111111111',
  first_name: 'John',
  last_name: 'Smith',
  dob: '1980-01-15',
  gender: 'Male',
  phone: '(555) 123-4567',
  email: 'john.smith@stayhealthy.test',
};

const mockDoctor = {
  id: doctorId,
  user_id: doctorUserId,
  first_name: 'Emily',
  last_name: 'Johnson',
  license_number: '12345',
  specialty: 'Family Medicine',
  phone: '(555) 987-6543',
  email: 'dr.emily@stayhealthy.test',
  user_email: 'dr.emily@stayhealthy.test',
  user_role: 'doctor',
  mfa_enabled: false,
};

const prescriptionSummary = {
  id: prescriptionId,
  status: 'active',
  issuedAt: '2023-07-10T10:00:00Z',
  expiresAt: '2023-08-10T10:00:00Z',
  notes: 'Follow up in 2 weeks',
  doctor: {
    id: doctorId,
    name: 'Dr. Emily Johnson',
  },
};

const prescriptionDetail = {
  ...prescriptionSummary,
  patient: { id: patientId, name: 'John Smith' },
  items: [
    {
      id: '12121212-1212-4121-8121-121212121212',
      medicationId,
      name: 'Amoxicillin',
      form: 'capsule',
      strength: '500mg',
      dose: '500mg',
      route: 'oral',
      frequency: 'TID',
      duration: '10 days',
      quantity: '30 capsules',
      instructions: 'Take with meals.',
    },
  ],
  interactionWarnings: [],
};

jest.mock('../../src/infra/v2/audit.repository', () => {
  return {
    AuditRepository: class AuditRepository {
      async create(event) {
        auditEvents.push(event);
      }

      async list() {
        return auditEvents;
      }
    },
  };
});

jest.mock('../../src/infra/v2/doctors.repository', () => {
  return {
    DoctorsRepository: class DoctorsRepository {
      async findByUserId(userId) {
        return userId === doctorUserId ? mockDoctor : null;
      }
    },
  };
});

jest.mock('../../src/infra/v2/encounters.repository', () => {
  return {
    EncountersRepository: class EncountersRepository {
      async existsForDoctorPatient() {
        return true;
      }

      async findByDoctorPatient() {
        return {
          id: encounterId,
          patient_id: patientId,
          doctor_id: doctorId,
          status: 'open',
          started_at: new Date('2023-07-10T09:00:00Z'),
          ended_at: null,
        };
      }

      async findById() {
        return {
          id: encounterId,
          patient_id: patientId,
          doctor_id: doctorId,
          status: 'open',
          started_at: new Date('2023-07-10T09:00:00Z'),
          ended_at: null,
        };
      }

      async create() {
        return {
          id: encounterId,
          patient_id: patientId,
          doctor_id: doctorId,
          facility_id: null,
          status: 'open',
          started_at: new Date('2023-07-10T09:00:00Z'),
          ended_at: null,
          created_at: new Date('2023-07-10T09:00:00Z'),
          updated_at: new Date('2023-07-10T09:00:00Z'),
        };
      }

      async update() {
        return {
          id: encounterId,
          patient_id: patientId,
          doctor_id: doctorId,
          facility_id: null,
          status: 'closed',
          started_at: new Date('2023-07-10T09:00:00Z'),
          ended_at: new Date('2023-07-10T09:30:00Z'),
          created_at: new Date('2023-07-10T09:00:00Z'),
          updated_at: new Date('2023-07-10T09:30:00Z'),
        };
      }
    },
  };
});

jest.mock('../../src/infra/v2/patients.repository', () => {
  return {
    PatientsRepository: class PatientsRepository {
      async searchForDoctor() {
        return [mockPatient];
      }

      async findById() {
        return mockPatient;
      }
    },
  };
});

jest.mock('../../src/infra/v2/prescriptions.repository', () => {
  return {
    PrescriptionsRepository: class PrescriptionsRepository {
      async listByPatientId() {
        return [prescriptionSummary];
      }

      async findById() {
        return prescriptionDetail;
      }

      async create() {
        return prescriptionDetail;
      }

      async update() {
        return { ...prescriptionDetail, status: 'completed' };
      }
    },
  };
});

jest.mock('../../src/infra/v2/medications.repository', () => {
  return {
    MedicationsRepository: class MedicationsRepository {
      async findByIds(ids) {
        return ids.map((id) => ({ id, name: 'Amoxicillin', is_active: true }));
      }
    },
  };
});

jest.mock('../../src/infra/v2/allergies.repository', () => {
  return {
    AllergiesRepository: class AllergiesRepository {
      async findByPatientId() {
        return [];
      }
    },
  };
});

const app = require('../../src/app');
const tokenService = require('../../src/infra/auth/jwtToken.service');

const doctorToken = () =>
  tokenService.sign({
    sub: doctorUserId,
    email: 'dr.emily@stayhealthy.test',
    role: 'doctor',
  });

const hasEvent = (eventType) => auditEvents.some((evt) => evt.event_type === eventType);

describe('Integration: Doctor audit logging', () => {
  beforeEach(() => {
    auditEvents.length = 0;
  });

  it('logs patient search results', async () => {
    const res = await request(app)
      .get('/api/v2/patients/search?name=John')
      .set('Authorization', `Bearer ${doctorToken()}`);

    expect(res.statusCode).toBe(200);
    expect(hasEvent('patient_search_result')).toBe(true);
  });

  it('logs patient view', async () => {
    const res = await request(app)
      .get(`/api/v2/patients/${patientId}`)
      .set('Authorization', `Bearer ${doctorToken()}`);

    expect(res.statusCode).toBe(200);
    expect(hasEvent('patient_view')).toBe(true);
  });

  it('logs encounter creation', async () => {
    const res = await request(app)
      .post('/api/v2/encounters')
      .set('Authorization', `Bearer ${doctorToken()}`)
      .send({ patientId });

    expect(res.statusCode).toBe(201);
    expect(hasEvent('encounter_created')).toBe(true);
  });

  it('logs prescription creation', async () => {
    const res = await request(app)
      .post('/api/v2/prescriptions')
      .set('Authorization', `Bearer ${doctorToken()}`)
      .send({
        patientId,
        items: [
          {
            medicationId,
            dose: '500mg',
            route: 'oral',
            frequency: 'TID',
            duration: '10 days',
            quantity: '30 capsules',
            instructions: 'Take with meals.',
          },
        ],
      });

    expect(res.statusCode).toBe(201);
    expect(hasEvent('prescription_created')).toBe(true);
  });

  it('logs encounter status update', async () => {
    const res = await request(app)
      .patch(`/api/v2/encounters/${encounterId}`)
      .set('Authorization', `Bearer ${doctorToken()}`)
      .send({ status: 'closed' });

    expect(res.statusCode).toBe(200);
    expect(hasEvent('encounter_status_updated')).toBe(true);
  });

  it('logs prescription updates', async () => {
    const res = await request(app)
      .patch(`/api/v2/prescriptions/${prescriptionId}`)
      .set('Authorization', `Bearer ${doctorToken()}`)
      .send({ status: 'completed' });

    expect(res.statusCode).toBe(200);
    expect(hasEvent('prescription_updated')).toBe(true);
  });
});
