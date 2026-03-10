const { DoctorsService } = require('../../src/core/v2/doctors.service');
const { DoctorContextService } = require('../../src/core/v2/doctorContext.service');
const { EncountersService } = require('../../src/core/v2/encounters.service');

describe('Unit: core/v2 services', () => {
  describe('DoctorContextService', () => {
    it('returns doctor for known user id', async () => {
      const doctorsRepository = { findByUserId: jest.fn().mockResolvedValue({ id: 'doc-1' }) };
      const encountersRepository = { existsForDoctorPatient: jest.fn() };
      const service = new DoctorContextService({ doctorsRepository, encountersRepository });

      await expect(service.getDoctorByUserId('user-1')).resolves.toEqual({ id: 'doc-1' });
      expect(doctorsRepository.findByUserId).toHaveBeenCalledWith('user-1');
    });

    it('throws when user is not a doctor', async () => {
      const doctorsRepository = { findByUserId: jest.fn().mockResolvedValue(null) };
      const encountersRepository = { existsForDoctorPatient: jest.fn() };
      const service = new DoctorContextService({ doctorsRepository, encountersRepository });

      await expect(service.getDoctorByUserId('user-1')).rejects.toMatchObject({
        status: 403,
        code: 'NOT_AUTHORIZED',
      });
    });

    it('enforces patient access checks', async () => {
      const doctorsRepository = { findByUserId: jest.fn() };
      const encountersRepository = { existsForDoctorPatient: jest.fn().mockResolvedValue(false) };
      const service = new DoctorContextService({ doctorsRepository, encountersRepository });

      await expect(service.ensurePatientAccess({ doctorId: 'doc-1', patientId: 'pat-1' })).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
      expect(encountersRepository.existsForDoctorPatient).toHaveBeenCalledWith({
        doctorId: 'doc-1',
        patientId: 'pat-1',
        status: 'open',
      });
    });
  });

  describe('DoctorsService', () => {
    it('maps getMe response and returns mfa/email fields', async () => {
      const doctorsRepository = {
        findByUserId: jest.fn().mockResolvedValue({
          id: 'doc-1',
          user_id: 'user-1',
          first_name: 'Ana',
          last_name: 'Silva',
          license_number: 'LIC-1',
          specialty: 'cardiology',
          phone: '555-111',
          user_email: 'ana@example.com',
          mfa_enabled: true,
        }),
      };
      const service = new DoctorsService({ doctorsRepository });

      await expect(service.getMe('user-1')).resolves.toEqual({
        id: 'doc-1',
        userId: 'user-1',
        firstName: 'Ana',
        lastName: 'Silva',
        licenseNumber: 'LIC-1',
        specialty: 'cardiology',
        phone: '555-111',
        email: 'ana@example.com',
        mfaEnabled: true,
      });
    });

    it('blocks getById for non-admin mismatched requester', async () => {
      const doctorsRepository = {
        findById: jest.fn().mockResolvedValue({
          id: 'doc-1',
          user_id: 'different-user',
          first_name: 'Ana',
          last_name: 'Silva',
          license_number: 'LIC-1',
        }),
      };
      const service = new DoctorsService({ doctorsRepository });

      await expect(
        service.getById({ doctorId: 'doc-1', requester: { role: 'doctor', sub: 'user-1' } })
      ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });

    it('allows admin to fetch doctor profile', async () => {
      const doctorsRepository = {
        findById: jest.fn().mockResolvedValue({
          id: 'doc-1',
          user_id: 'user-1',
          first_name: 'Ana',
          last_name: 'Silva',
          license_number: 'LIC-1',
          specialty: null,
          phone: null,
          email: 'fallback@example.com',
          mfa_enabled: false,
        }),
      };
      const service = new DoctorsService({ doctorsRepository });

      await expect(
        service.getById({ doctorId: 'doc-1', requester: { role: 'admin', sub: 'admin-1' } })
      ).resolves.toMatchObject({ id: 'doc-1', email: 'fallback@example.com' });
    });
  });

  describe('EncountersService', () => {
    const buildService = () => {
      const encountersRepository = {
        findByDoctorPatient: jest.fn(),
        create: jest.fn(),
        findById: jest.fn(),
        update: jest.fn(),
      };
      const patientsRepository = { findById: jest.fn() };
      const doctorContext = {
        getDoctorByUserId: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      };
      const service = new EncountersService({ encountersRepository, patientsRepository, doctorContext });
      return { service, encountersRepository, patientsRepository, doctorContext };
    };

    it('creates encounter when patient exists and no open encounter', async () => {
      const { service, encountersRepository, patientsRepository } = buildService();
      patientsRepository.findById.mockResolvedValue({ id: 'pat-1' });
      encountersRepository.findByDoctorPatient.mockResolvedValue(null);
      encountersRepository.create.mockImplementation(async (payload) => ({
        ...payload,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }));

      const result = await service.create({ doctorUserId: 'user-1', patientId: 'pat-1', facilityId: 'fac-1' });

      expect(encountersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: 'pat-1',
          doctor_id: 'doc-1',
          facility_id: 'fac-1',
          status: 'open',
          started_at: expect.any(Date),
          ended_at: null,
        })
      );
      expect(result).toMatchObject({ patientId: 'pat-1', doctorId: 'doc-1', status: 'open' });
    });

    it('rejects encounter create when patient is missing', async () => {
      const { service, patientsRepository } = buildService();
      patientsRepository.findById.mockResolvedValue(null);

      await expect(service.create({ doctorUserId: 'user-1', patientId: 'pat-1' })).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('sets ended_at when closing and clears it when reopening', async () => {
      const { service, encountersRepository } = buildService();
      encountersRepository.findById
        .mockResolvedValueOnce({ id: 'enc-1', doctor_id: 'doc-1', started_at: new Date('2026-01-01T00:00:00Z') })
        .mockResolvedValueOnce({ id: 'enc-1', doctor_id: 'doc-1', started_at: null });

      encountersRepository.update
        .mockResolvedValueOnce({
          id: 'enc-1',
          patient_id: 'pat-1',
          doctor_id: 'doc-1',
          facility_id: null,
          status: 'closed',
          started_at: new Date('2026-01-01T00:00:00Z'),
          ended_at: new Date('2026-01-02T00:00:00Z'),
        })
        .mockResolvedValueOnce({
          id: 'enc-1',
          patient_id: 'pat-1',
          doctor_id: 'doc-1',
          facility_id: null,
          status: 'open',
          started_at: new Date('2026-01-03T00:00:00Z'),
          ended_at: null,
        });

      await service.updateStatus({ doctorUserId: 'user-1', encounterId: 'enc-1', status: 'closed' });
      await service.updateStatus({ doctorUserId: 'user-1', encounterId: 'enc-1', status: 'open' });

      expect(encountersRepository.update).toHaveBeenNthCalledWith(
        1,
        'enc-1',
        expect.objectContaining({ status: 'closed', ended_at: expect.any(Date) })
      );
      expect(encountersRepository.update).toHaveBeenNthCalledWith(
        2,
        'enc-1',
        expect.objectContaining({ status: 'open', ended_at: null, started_at: expect.any(Date) })
      );
    });
  });
});
