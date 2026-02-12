const request = require('supertest');
const { buildTestEmail } = require('../helpers/testCredentials');

const mockAuditEvents = [];
let mockLastListFilters = null;
const mockPatient = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  first_name: 'John',
  last_name: 'Smith',
  dob: '1980-01-15',
  gender: 'Male',
  phone: '(555) 123-4567',
  email: buildTestEmail('patient'),
};

const mockPrescriptionSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  status: 'active',
  issuedAt: '2023-07-10T10:00:00Z',
  expiresAt: '2023-08-10T10:00:00Z',
  notes: 'Follow up in 2 weeks',
  doctor: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Dr. Emily Johnson',
  },
};

const mockPrescriptionDetail = {
  ...mockPrescriptionSummary,
  patient: { id: mockPatient.id, name: 'John Smith' },
  items: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      medicationId: '66666666-6666-4666-8666-666666666666',
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
        mockAuditEvents.push(event);
      }

      async list(filters) {
        mockLastListFilters = filters;
        return mockAuditEvents;
      }
    },
    __events: mockAuditEvents,
  };
});

jest.mock('../../src/infra/v2/patients.repository', () => {
  return {
    PatientsRepository: class PatientsRepository {
      async findByUserId(userId) {
        return userId === mockPatient.user_id ? mockPatient : null;
      }
    },
  };
});

jest.mock('../../src/infra/v2/prescriptions.repository', () => {
  return {
    PrescriptionsRepository: class PrescriptionsRepository {
      async listByPatientId(patientId) {
        return patientId === mockPatient.id ? [mockPrescriptionSummary] : [];
      }

      async findById(id) {
        return id === mockPrescriptionDetail.id ? mockPrescriptionDetail : null;
      }
    },
  };
});

const app = require('../../src/app');
const tokenService = require('../../src/infra/auth/jwtToken.service');

describe('Integration: Audit logging', () => {
  beforeEach(() => {
    mockAuditEvents.length = 0;
    mockLastListFilters = null;
  });

  it('creates an audit event when patient lists prescriptions', async () => {
    const token = tokenService.sign({
      sub: mockPatient.user_id,
      email: mockPatient.email,
      role: 'patient',
    });
    const requestId = 'audit-patient-req-1';
    const userAgent = 'jest-audit-agent';

    const res = await request(app)
      .get('/api/v2/patient/me/prescriptions')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', requestId)
      .set('User-Agent', userAgent);

    expect(res.statusCode).toBe(200);
    expect(mockAuditEvents.some((evt) => evt.event_type === 'patient_portal_prescriptions_view')).toBe(true);
    const event = mockAuditEvents[mockAuditEvents.length - 1];
    expect(event.ip_address).toContain('127.0.0.1');
    expect(event.user_agent).toBe(userAgent);
    expect(event.metadata).toMatchObject({ requestId });
  });

  it('creates an audit event when patient views prescription detail', async () => {
    const token = tokenService.sign({
      sub: mockPatient.user_id,
      email: mockPatient.email,
      role: 'patient',
    });

    const res = await request(app)
      .get(`/api/v2/patient/me/prescriptions/${mockPrescriptionDetail.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(mockAuditEvents.some((evt) => evt.event_type === 'patient_portal_prescription_view')).toBe(true);
  });

  it('allows admin to list audit events', async () => {
    const patientToken = tokenService.sign({
      sub: mockPatient.user_id,
      email: mockPatient.email,
      role: 'patient',
    });

    await request(app)
      .get('/api/v2/patient/me/prescriptions')
      .set('Authorization', `Bearer ${patientToken}`);

    const adminToken = tokenService.sign({
      sub: '77777777-7777-4777-8777-777777777777',
      email: buildTestEmail('admin'),
      role: 'admin',
    });

    const res = await request(app)
      .get('/api/v2/audit/events')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);
  });

  it('passes query filters to the audit repository', async () => {
    const adminToken = tokenService.sign({
      sub: '77777777-7777-4777-8777-777777777777',
      email: buildTestEmail('admin'),
      role: 'admin',
    });

    const res = await request(app)
      .get('/api/v2/audit/events?event_type=patient_portal_prescriptions_view&limit=10&offset=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(mockLastListFilters).toMatchObject({
      eventType: 'patient_portal_prescriptions_view',
      limit: 10,
      offset: 5,
    });
  });
});
