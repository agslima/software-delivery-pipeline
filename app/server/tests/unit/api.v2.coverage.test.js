const validUuid = '123e4567-e89b-42d3-a456-426614174000';
const buildFixtureToken = (prefix = 'fixture') => `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
const buildFixtureEmail = () => `${Math.random().toString(36).slice(2, 10)}@example.test`;
const buildFixturePassword = (length = 12) => `T${Math.random().toString(36).slice(2, 2 + length)}9!`;

describe('Unit: api/v2 coverage', () => {
  describe('audit.helpers', () => {
    afterEach(() => {
      jest.resetModules();
      jest.clearAllMocks();
      jest.dontMock('../../src/observability/logger');
      jest.dontMock('../../src/config/audit');
    });

    it('buildAuditContext maps request metadata safely', () => {
      const { buildAuditContext } = require('../../src/api/v2/audit/audit.helpers');
      const req = {
        user: { sub: 'user-1' },
        ip: '127.0.0.1',
        id: 'req-1',
        get: jest.fn((name) => (name === 'user-agent' ? 'jest-agent' : null)),
      };

      expect(buildAuditContext(req)).toEqual({
        actorUserId: 'user-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest-agent',
        metadata: { requestId: 'req-1' },
      });
    });

    it('sanitizeMetadata redacts sensitive keys and strict-mode objects', () => {
      const { sanitizeMetadata } = require('../../src/api/v2/audit/audit.helpers');
      const input = {
        refreshToken: buildFixtureToken('refresh'),
        password: buildFixtureToken('password'),
        safe: 'value',
        nested: { secret: true },
      };

      expect(sanitizeMetadata(input, 'none')).toEqual({
        refreshToken: '[REDACTED]',
        password: '[REDACTED]',
        safe: 'value',
        nested: { secret: true },
      });

      expect(sanitizeMetadata(input, 'strict')).toEqual({
        refreshToken: '[REDACTED]',
        password: '[REDACTED]',
        safe: 'value',
        nested: '[REDACTED]',
      });
    });

    it('safeAudit applies default redaction mode and logs sanitized payload', async () => {
      const warn = jest.fn();
      jest.doMock('../../src/observability/logger', () => ({ warn }));
      jest.doMock('../../src/config/audit', () => ({ piiRedaction: 'strict' }));

      let safeAudit;
      jest.isolateModules(() => {
        ({ safeAudit } = require('../../src/api/v2/audit/audit.helpers'));
      });

      const logEvent = jest.fn().mockResolvedValue(undefined);
      await safeAudit({ logEvent }, { eventType: 'x', metadata: { token: buildFixtureToken('token'), nested: { a: 1 } } });

      expect(logEvent).toHaveBeenCalledWith({
        eventType: 'x',
        redactionMode: 'strict',
        metadata: { token: '[REDACTED]', nested: '[REDACTED]' },
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('safeAudit swallows failures and emits warning log', async () => {
      const warn = jest.fn();
      jest.doMock('../../src/observability/logger', () => ({ warn }));

      let safeAudit;
      jest.isolateModules(() => {
        ({ safeAudit } = require('../../src/api/v2/audit/audit.helpers'));
      });

      const failure = new Error('audit failed');
      const logEvent = jest.fn().mockRejectedValue(failure);

      await expect(safeAudit({ logEvent }, { eventType: 'x', metadata: {} })).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith({ err: failure }, 'Audit log failed');
    });
  });

  describe('v2 request schemas', () => {
    it('auth login schema normalizes email and rejects weak password', () => {
      const { loginSchema } = require('../../src/api/v2/auth/auth.schemas');

      const fixtureEmail = buildFixtureEmail();
      const valid = loginSchema.validate({
        email: `  ${fixtureEmail.toUpperCase()} `,
        password: buildFixturePassword(),
      });
      expect(valid.error).toBeUndefined();
      expect(valid.value.email).toBe(fixtureEmail.toLowerCase());

      const invalid = loginSchema.validate({ email: buildFixtureEmail(), password: 'weak' });
      expect(invalid.error).toBeDefined();
    });

    it('patients search schema enforces filter presence', () => {
      const { searchSchema } = require('../../src/api/v2/patients/patients.schemas');

      expect(searchSchema.validate({}).error).toBeDefined();
      expect(searchSchema.validate({ name: 'Ana' }).error).toBeUndefined();
    });

    it('prescriptions schemas enforce required ids/items and update min payload', () => {
      const {
        createPrescriptionSchema,
        createPrescriptionExportSchema,
        updatePrescriptionSchema,
      } = require('../../src/api/v2/prescriptions/prescriptions.schemas');
      const { exportJobIdParamsSchema } = require('../../src/api/v2/exports/exports.schemas');

      expect(
        createPrescriptionSchema.validate({
          patientId: validUuid,
          items: [{ medicationId: validUuid, dose: '1x', instructions: 'after meal' }],
        }).error
      ).toBeUndefined();

      expect(createPrescriptionSchema.validate({ patientId: validUuid, items: [] }).error).toBeDefined();
      expect(updatePrescriptionSchema.validate({}).error).toBeDefined();
      expect(updatePrescriptionSchema.validate({ status: 'completed' }).error).toBeUndefined();
      expect(createPrescriptionExportSchema.validate({ format: 'json' }).error).toBeUndefined();
      expect(exportJobIdParamsSchema.validate({ id: validUuid }).error).toBeUndefined();
    });

    it('encounters and medications schemas validate status/query constraints', () => {
      const { updateEncounterSchema } = require('../../src/api/v2/encounters/encounters.schemas');
      const { medicationsSearchSchema } = require('../../src/api/v2/medications/medications.schemas');

      expect(updateEncounterSchema.validate({ status: 'open' }).error).toBeUndefined();
      expect(updateEncounterSchema.validate({ status: 'invalid' }).error).toBeDefined();

      expect(medicationsSearchSchema.validate({ query: 'am', limit: 10 }).error).toBeUndefined();
      expect(medicationsSearchSchema.validate({ query: 'a' }).error).toBeDefined();
    });
  });
  describe('v2 controllers', () => {
    afterEach(() => {
      jest.resetModules();
      jest.clearAllMocks();
      jest.dontMock('../../src/core/v2/doctors.service');
      jest.dontMock('../../src/infra/v2/doctors.repository');
      jest.dontMock('../../src/core/v2/medications.service');
      jest.dontMock('../../src/infra/v2/medications.repository');
    });

    it('doctors controller returns getMe payload and forwards failures', async () => {
      const getMe = jest.fn().mockResolvedValue({ id: 'doc-1' });
      const getById = jest.fn().mockResolvedValue({ id: 'doc-2' });

      jest.doMock('../../src/core/v2/doctors.service', () => ({
        DoctorsService: jest.fn().mockImplementation(() => ({ getMe, getById })),
      }));
      jest.doMock('../../src/infra/v2/doctors.repository', () => ({
        DoctorsRepository: jest.fn().mockImplementation(() => ({})),
      }));

      let controller;
      jest.isolateModules(() => {
        controller = require('../../src/api/v2/doctors/doctors.controller');
      });

      const req = { user: { sub: 'user-1' }, params: { id: 'doc-2' } };
      const res = { json: jest.fn().mockReturnValue('json-ok') };
      const next = jest.fn();

      await expect(controller.getMe(req, res, next)).resolves.toBe('json-ok');
      expect(getMe).toHaveBeenCalledWith('user-1');
      expect(res.json).toHaveBeenCalledWith({ id: 'doc-1' });

      await expect(controller.getById(req, res, next)).resolves.toBe('json-ok');
      expect(getById).toHaveBeenCalledWith({ doctorId: 'doc-2', requester: req.user });

      const err = new Error('boom');
      getMe.mockRejectedValueOnce(err);
      await controller.getMe(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });

    it('medications controller wraps search response and forwards errors', async () => {
      const search = jest.fn().mockResolvedValue([{ id: 'med-1' }]);

      jest.doMock('../../src/core/v2/medications.service', () => ({
        MedicationsService: jest.fn().mockImplementation(() => ({ search })),
      }));
      jest.doMock('../../src/infra/v2/medications.repository', () => ({
        MedicationsRepository: jest.fn().mockImplementation(() => ({})),
      }));

      let controller;
      jest.isolateModules(() => {
        controller = require('../../src/api/v2/medications/medications.controller');
      });

      const req = { query: { query: 'amox', limit: 5 } };
      const res = { json: jest.fn().mockReturnValue('json-ok') };
      const next = jest.fn();

      await expect(controller.search(req, res, next)).resolves.toBe('json-ok');
      expect(search).toHaveBeenCalledWith('amox', 5);
      expect(res.json).toHaveBeenCalledWith({ results: [{ id: 'med-1' }] });

      const err = new Error('search failed');
      search.mockRejectedValueOnce(err);
      await controller.search(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

});
