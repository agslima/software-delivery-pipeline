const loadController = ({
  searchResult = [],
  searchError,
  patientResult = { id: 'patient-1', firstName: 'A' },
  patientError,
  summaryResult = {
    patient: { id: 'patient-1' },
    allergies: [{ id: 'allergy-1' }],
    prescriptions: [{ id: 'rx-1' }, { id: 'rx-2' }],
  },
  summaryError,
  prescriptionsResult = [{ id: 'rx-1' }],
  prescriptionsError,
} = {}) => {
  jest.resetModules();

  const search = searchError ? jest.fn().mockRejectedValue(searchError) : jest.fn().mockResolvedValue(searchResult);
  const getById = patientError ? jest.fn().mockRejectedValue(patientError) : jest.fn().mockResolvedValue(patientResult);
  const getSummary = summaryError
    ? jest.fn().mockRejectedValue(summaryError)
    : jest.fn().mockResolvedValue(summaryResult);
  const getPrescriptions = prescriptionsError
    ? jest.fn().mockRejectedValue(prescriptionsError)
    : jest.fn().mockResolvedValue(prescriptionsResult);

  const safeAudit = jest.fn().mockResolvedValue(undefined);
  const buildAuditContext = jest.fn().mockReturnValue({ metadata: { requestId: 'req-1' }, ipAddress: '127.0.0.1' });

  jest.doMock('../../src/core/v2/patients.service', () => ({
    PatientsService: jest.fn().mockImplementation(() => ({ search, getById, getSummary, getPrescriptions })),
  }));

  jest.doMock('../../src/core/v2/doctorContext.service', () => ({
    DoctorContextService: jest.fn().mockImplementation(() => ({})),
  }));
  jest.doMock('../../src/infra/v2/patients.repository', () => ({
    PatientsRepository: jest.fn().mockImplementation(() => ({})),
  }));
  jest.doMock('../../src/infra/v2/allergies.repository', () => ({
    AllergiesRepository: jest.fn().mockImplementation(() => ({})),
  }));
  jest.doMock('../../src/infra/v2/prescriptions.repository', () => ({
    PrescriptionsRepository: jest.fn().mockImplementation(() => ({})),
  }));
  jest.doMock('../../src/infra/v2/doctors.repository', () => ({
    DoctorsRepository: jest.fn().mockImplementation(() => ({})),
  }));
  jest.doMock('../../src/infra/v2/encounters.repository', () => ({
    EncountersRepository: jest.fn().mockImplementation(() => ({})),
  }));
  jest.doMock('../../src/config/audit', () => ({ sink: 'console', piiRedaction: 'none' }));
  jest.doMock('../../src/core/v2/audit.service', () => ({ AuditService: jest.fn().mockImplementation(() => ({})) }));
  jest.doMock('../../src/infra/v2/audit.repository', () => ({ AuditRepository: jest.fn().mockImplementation(() => ({})) }));
  jest.doMock('../../src/infra/v2/audit.console.repository', () => ({
    AuditConsoleRepository: jest.fn().mockImplementation(() => ({})),
  }));
  jest.doMock('../../src/api/v2/audit/audit.helpers', () => ({ buildAuditContext, safeAudit }));

  let controller;
  jest.isolateModules(() => {
    controller = require('../../src/api/v2/patients/patients.controller');
  });

  return {
    controller,
    mocks: {
      search,
      getById,
      getSummary,
      getPrescriptions,
      buildAuditContext,
      safeAudit,
    },
  };
};

describe('Unit: api/v2/patients.controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('search returns results and audits each patient result', async () => {
    const searchResult = [{ id: 'pat-1' }, { id: 'pat-2' }];
    const { controller, mocks } = loadController({ searchResult });

    const req = { user: { sub: 'doc-1' }, query: { name: 'Jane', dob: '1990-01-01', limit: '5' } };
    const json = jest.fn();

    await controller.search(req, { json }, jest.fn());

    expect(mocks.search).toHaveBeenCalledWith({ doctorUserId: 'doc-1', name: 'Jane', dob: '1990-01-01', limit: '5' });
    expect(mocks.safeAudit).toHaveBeenCalledTimes(2);
    expect(mocks.safeAudit).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      expect.objectContaining({ eventType: 'patient_search_result', subjectType: 'patient', subjectId: 'pat-1' })
    );
    expect(json).toHaveBeenCalledWith({ results: searchResult });
  });

  it('getPatient returns patient and emits patient_view audit', async () => {
    const { controller, mocks } = loadController({ patientResult: { id: 'pat-9', firstName: 'Joe' } });
    const req = { user: { sub: 'doc-1' }, params: { id: 'pat-9' } };
    const json = jest.fn();

    await controller.getPatient(req, { json }, jest.fn());

    expect(mocks.getById).toHaveBeenCalledWith({ doctorUserId: 'doc-1', patientId: 'pat-9' });
    expect(mocks.safeAudit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ eventType: 'patient_view', subjectType: 'patient', subjectId: 'pat-9' })
    );
    expect(json).toHaveBeenCalledWith({ id: 'pat-9', firstName: 'Joe' });
  });

  it('getSummary returns summary and audits counts', async () => {
    const summaryResult = {
      patient: { id: 'pat-1' },
      allergies: [{ id: 'a1' }, { id: 'a2' }],
      prescriptions: [{ id: 'rx1' }],
    };
    const { controller, mocks } = loadController({ summaryResult });
    const req = { user: { sub: 'doc-2' }, params: { id: 'pat-1' } };
    const json = jest.fn();

    await controller.getSummary(req, { json }, jest.fn());

    expect(mocks.getSummary).toHaveBeenCalledWith({ doctorUserId: 'doc-2', patientId: 'pat-1' });
    expect(mocks.safeAudit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'patient_summary_view',
        subjectId: 'pat-1',
        metadata: expect.objectContaining({ allergiesCount: 2, prescriptionsCount: 1 }),
      })
    );
    expect(json).toHaveBeenCalledWith(summaryResult);
  });

  it('getPrescriptions returns prescriptions list and audits count', async () => {
    const prescriptionsResult = [{ id: 'rx1' }, { id: 'rx2' }, { id: 'rx3' }];
    const { controller, mocks } = loadController({ prescriptionsResult });
    const req = { user: { sub: 'doc-3' }, params: { id: 'pat-3' } };
    const json = jest.fn();

    await controller.getPrescriptions(req, { json }, jest.fn());

    expect(mocks.getPrescriptions).toHaveBeenCalledWith({ doctorUserId: 'doc-3', patientId: 'pat-3' });
    expect(mocks.safeAudit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'patient_prescriptions_view',
        subjectId: 'pat-3',
        metadata: expect.objectContaining({ count: 3 }),
      })
    );
    expect(json).toHaveBeenCalledWith({ prescriptions: prescriptionsResult });
  });

  it('forwards service errors to next', async () => {
    const error = new Error('boom');
    const { controller } = loadController({ searchError: error });
    const next = jest.fn();

    await controller.search({ user: { sub: 'doc-1' }, query: {} }, { json: jest.fn() }, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
