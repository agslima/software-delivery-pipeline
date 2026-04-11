const { DoctorsService } = require('../../src/core/v2/doctors.service');
const { DoctorContextService } = require('../../src/core/v2/doctorContext.service');
const { EncountersService } = require('../../src/core/v2/encounters.service');
const { ExportJobsService } = require('../../src/core/v2/exportJobs.service');
const { ExportWorkerService } = require('../../src/core/v2/exportWorker.service');

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

      expect(encountersRepository.findByDoctorPatient).toHaveBeenCalledWith({
        doctorId: 'doc-1',
        patientId: 'pat-1',
        status: 'open',
      });
      expect(encountersRepository.findByDoctorPatient.mock.invocationCallOrder[0]).toBeLessThan(
        encountersRepository.create.mock.invocationCallOrder[0]
      );
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

  describe('ExportJobsService', () => {
    const buildService = () => {
      const exportJobsRepository = {
        enqueueOrReuse: jest.fn(),
        findById: jest.fn(),
      };
      const prescriptionsRepository = { findById: jest.fn() };
      const doctorContext = {
        getDoctorByUserId: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      };

      const service = new ExportJobsService({
        exportJobsRepository,
        prescriptionsRepository,
        doctorContext,
      });

      return { service, exportJobsRepository, prescriptionsRepository, doctorContext };
    };

    it('queues export jobs for the prescribing doctor', async () => {
      const { service, exportJobsRepository, prescriptionsRepository } = buildService();
      prescriptionsRepository.findById.mockResolvedValue({
        id: 'rx-1',
        doctor: { id: 'doc-1' },
        updatedAt: new Date('2026-04-11T12:00:00.000Z'),
      });
      exportJobsRepository.enqueueOrReuse.mockResolvedValue({ id: 'job-1', status: 'queued' });

      await expect(service.enqueue({ doctorUserId: 'user-1', prescriptionId: 'rx-1' })).resolves.toEqual({
        id: 'job-1',
        status: 'queued',
      });

      expect(exportJobsRepository.enqueueOrReuse).toHaveBeenCalledWith(
        expect.objectContaining({
          prescriptionId: 'rx-1',
          doctorId: 'doc-1',
          format: 'json',
          maxAttempts: 5,
          idempotencyKey: 'rx-1:json:2026-04-11T12:00:00.000Z',
        })
      );
    });

    it('rejects export jobs when the requester is not the prescribing doctor', async () => {
      const { service, prescriptionsRepository } = buildService();
      prescriptionsRepository.findById.mockResolvedValue({
        id: 'rx-1',
        doctor: { id: 'doc-2' },
        updatedAt: new Date('2026-04-11T12:00:00.000Z'),
      });

      await expect(service.enqueue({ doctorUserId: 'user-1', prescriptionId: 'rx-1' })).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('returns job details scoped to the requesting doctor', async () => {
      const { service, exportJobsRepository } = buildService();
      exportJobsRepository.findById.mockResolvedValue({ id: 'job-1', doctorId: 'doc-1' });

      await expect(service.getById({ doctorUserId: 'user-1', jobId: 'job-1' })).resolves.toEqual({
        id: 'job-1',
        doctorId: 'doc-1',
      });
      expect(exportJobsRepository.findById).toHaveBeenCalledWith('job-1', { doctorId: 'doc-1' });
    });
  });

  describe('ExportWorkerService', () => {
    const buildService = () => {
      const exportJobsRepository = {
        claimNextRunnable: jest.fn(),
        markCompleted: jest.fn(),
        markRetry: jest.fn(),
        markFailed: jest.fn(),
      };
      const prescriptionsRepository = { findById: jest.fn() };
      const service = new ExportWorkerService({
        exportJobsRepository,
        prescriptionsRepository,
      });
      return { service, exportJobsRepository, prescriptionsRepository };
    };

    it('returns null when no jobs are queued', async () => {
      const { service, exportJobsRepository } = buildService();
      exportJobsRepository.claimNextRunnable.mockResolvedValue(null);

      await expect(
        service.processNext({
          workerId: 'worker-1',
          leaseSeconds: 30,
          maxAttempts: 5,
        })
      ).resolves.toBeNull();
    });

    it('marks a claimed export job completed after generating the payload', async () => {
      const now = new Date('2026-04-11T12:00:00.000Z');
      const { service, exportJobsRepository, prescriptionsRepository } = buildService();
      exportJobsRepository.claimNextRunnable.mockResolvedValue({
        id: 'job-1',
        prescriptionId: 'rx-1',
        doctorId: 'doc-1',
        attemptCount: 1,
        format: 'json',
      });
      prescriptionsRepository.findById.mockResolvedValue({
        id: 'rx-1',
        doctor: { id: 'doc-1' },
        patient: { id: 'pat-1' },
        items: [],
      });
      exportJobsRepository.markCompleted.mockResolvedValue({ id: 'job-1', status: 'completed' });

      await expect(
        service.processNext({
          workerId: 'worker-1',
          leaseSeconds: 30,
          maxAttempts: 5,
          now,
        })
      ).resolves.toEqual({
        outcome: 'completed',
        job: { id: 'job-1', status: 'completed' },
      });

      expect(exportJobsRepository.markCompleted).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          workerId: 'worker-1',
          contentType: 'application/json',
          fileName: 'prescription-rx-1-export.json',
          now,
        })
      );
    });

    it('requeues retryable failures while attempts remain', async () => {
      const now = new Date('2026-04-11T12:00:00.000Z');
      const { service, exportJobsRepository, prescriptionsRepository } = buildService();
      exportJobsRepository.claimNextRunnable.mockResolvedValue({
        id: 'job-1',
        prescriptionId: 'rx-1',
        doctorId: 'doc-1',
        attemptCount: 1,
        format: 'json',
      });
      prescriptionsRepository.findById.mockRejectedValue(new Error('database timeout'));
      exportJobsRepository.markRetry.mockResolvedValue({ id: 'job-1', status: 'queued' });

      const result = await service.processNext({
        workerId: 'worker-1',
        leaseSeconds: 30,
        maxAttempts: 5,
        now,
      });

      expect(result.outcome).toBe('retry');
      expect(exportJobsRepository.markRetry).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          workerId: 'worker-1',
          errorMessage: 'database timeout',
          now,
        })
      );
    });

    it('marks non-retryable poison jobs failed immediately', async () => {
      const now = new Date('2026-04-11T12:00:00.000Z');
      const { service, exportJobsRepository, prescriptionsRepository } = buildService();
      exportJobsRepository.claimNextRunnable.mockResolvedValue({
        id: 'job-1',
        prescriptionId: 'missing',
        doctorId: 'doc-1',
        attemptCount: 1,
        format: 'json',
      });
      prescriptionsRepository.findById.mockResolvedValue(null);
      exportJobsRepository.markFailed.mockResolvedValue({ id: 'job-1', status: 'failed' });

      const result = await service.processNext({
        workerId: 'worker-1',
        leaseSeconds: 30,
        maxAttempts: 5,
        now,
      });

      expect(result.outcome).toBe('failed');
      expect(exportJobsRepository.markFailed).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          workerId: 'worker-1',
          errorMessage: 'Prescription not found during export processing',
          now,
        })
      );
    });

    it('marks jobs failed after retry exhaustion', async () => {
      const now = new Date('2026-04-11T12:00:00.000Z');
      const { service, exportJobsRepository, prescriptionsRepository } = buildService();
      exportJobsRepository.claimNextRunnable.mockResolvedValue({
        id: 'job-1',
        prescriptionId: 'rx-1',
        doctorId: 'doc-1',
        attemptCount: 5,
        format: 'json',
      });
      prescriptionsRepository.findById.mockRejectedValue(new Error('database timeout'));
      exportJobsRepository.markFailed.mockResolvedValue({ id: 'job-1', status: 'failed' });

      const result = await service.processNext({
        workerId: 'worker-1',
        leaseSeconds: 30,
        maxAttempts: 5,
        now,
      });

      expect(result.outcome).toBe('failed');
      expect(exportJobsRepository.markFailed).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          workerId: 'worker-1',
          errorMessage: 'database timeout',
          now,
        })
      );
    });
  });
});
