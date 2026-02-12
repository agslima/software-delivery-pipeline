const request = require('supertest');
const { buildTestEmail } = require('../helpers/testCredentials');

const mockAuditEvents = [];

const mockDoctorUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mockDoctorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mockPatientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const mockEncounterId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const mockPrescriptionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockMedicationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const patientEmail = buildTestEmail('patient');
const doctorEmail = buildTestEmail('doctor');

const mockPatient = {
  id: mockPatientId,
  user_id: '11111111-1111-4111-8111-111111111111',
  first_name: 'John',
  last_name: 'Smith',
  dob: '1980-01-15',
  gender: 'Male',
  phone: '(555) 123-4567',
  email: patientEmail,
};

const mockDoctor = {
  id: mockDoctorId,
  user_id: mockDoctorUserId,
  first_name: 'Emily',
  last_name: 'Johnson',
  license_number: '12345',
  specialty: 'Family Medicine',
  phone: '(555) 987-6543',
  email: doctorEmail,
  user_email: doctorEmail,
  user_role: 'doctor',
  mfa_enabled: false,
};

const mockPrescriptionSummary = {
  id: mockPrescriptionId,
  status: 'active',
  issuedAt: '2023-07-10T10:00:00Z',
  expiresAt: '2023-08-10T10:00:00Z',
  notes: 'Follow up in 2 weeks',
  doctor: {
    id: mockDoctorId,
    name: 'Dr. Emily Johnson',
  },
};

const mockPrescriptionDetail = {
  ...mockPrescriptionSummary,
  patient: { id: mockPatientId, name: 'John Smith' },
  items: [
    {
      id: '12121212-1212-4121-8121-121212121212',
      medicationId: mockMedicationId,
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

const mockOpenEncounter = {
  id: mockEncounterId,
  patient_id: mockPatientId,
  doctor_id: mockDoctorId,
  status: 'open',
  started_at: new Date('2023-07-10T09:00:00Z'),
  ended_at: null,
};

let mockFindByDoctorPatientResult = mockOpenEncounter;

jest.mock('../../src/infra/v2/audit.repository', () => {
  return {
    AuditRepository: class AuditRepository {
      async create(event) {
        mockAuditEvents.push(event);
      }

      async list() {
        return mockAuditEvents;
      }
    },
  };
});

jest.mock('../../src/infra/v2/doctors.repository', () => {
  return {
    DoctorsRepository: class DoctorsRepository {
      async findByUserId(userId) {
        return userId === mockDoctorUserId ? mockDoctor : null;
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
        return mockFindByDoctorPatientResult;
      }

      async findById() {
        return mockOpenEncounter;
      }

      async create() {
        return {
          id: mockEncounterId,
          patient_id: mockPatientId,
          doctor_id: mockDoctorId,
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
          id: mockEncounterId,
          patient_id: mockPatientId,
          doctor_id: mockDoctorId,
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
        return [mockPrescriptionSummary];
      }

      async findById() {
        return mockPrescriptionDetail;
      }

      async create() {
        return mockPrescriptionDetail;
      }

      async update() {
        return { ...mockPrescriptionDetail, status: 'completed' };
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
    sub: mockDoctorUserId,
      email: doctorEmail,
    role: 'doctor',
  });

const hasEvent = (eventType) => mockAuditEvents.some((evt) => evt.event_type === eventType);

describe('Integration: Doctor audit logging', () => {
  beforeEach(() => {
    mockAuditEvents.length = 0;
    mockFindByDoctorPatientResult = mockOpenEncounter;
  });

  it('logs patient search results', async () => {
    const requestId = 'audit-doctor-req-1';
    const userAgent = 'jest-doctor-agent';
    const res = await request(app)
      .get('/api/v2/patients/search?name=John')
      .set('Authorization', `Bearer ${doctorToken()}`)
      .set('X-Request-Id', requestId)
      .set('User-Agent', userAgent);

    expect(res.statusCode).toBe(200);
    expect(hasEvent('patient_search_result')).toBe(true);
    const event = mockAuditEvents[mockAuditEvents.length - 1];
    expect(event.ip_address).toContain('127.0.0.1');
    expect(event.user_agent).toBe(userAgent);
    expect(event.metadata).toMatchObject({ requestId });
  });

  it('logs patient view', async () => {
    const res = await request(app)
      .get(`/api/v2/patients/${mockPatientId}`)
      .set('Authorization', `Bearer ${doctorToken()}`);

    expect(res.statusCode).toBe(200);
    expect(hasEvent('patient_view')).toBe(true);
  });

  it('logs encounter creation', async () => {
    mockFindByDoctorPatientResult = null;
    const res = await request(app)
      .post('/api/v2/encounters')
      .set('Authorization', `Bearer ${doctorToken()}`)
      .send({ patientId: mockPatientId });

    expect(res.statusCode).toBe(201);
    expect(hasEvent('encounter_created')).toBe(true);
  });

  it('logs prescription creation', async () => {
    const res = await request(app)
      .post('/api/v2/prescriptions')
      .set('Authorization', `Bearer ${doctorToken()}`)
      .send({
        patientId: mockPatientId,
        items: [
          {
            medicationId: mockMedicationId,
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
      .patch(`/api/v2/encounters/${mockEncounterId}`)
      .set('Authorization', `Bearer ${doctorToken()}`)
      .send({ status: 'closed' });

    expect(res.statusCode).toBe(200);
    expect(hasEvent('encounter_status_updated')).toBe(true);
  });

  it('logs prescription updates', async () => {
    const res = await request(app)
      .patch(`/api/v2/prescriptions/${mockPrescriptionId}`)
      .set('Authorization', `Bearer ${doctorToken()}`)
      .send({ status: 'completed' });

    expect(res.statusCode).toBe(200);
    expect(hasEvent('prescription_updated')).toBe(true);
  });
});
