const { PatientsService } = require('../../../core/v2/patients.service');
const { PatientsRepository } = require('../../../infra/v2/patients.repository');
const { AllergiesRepository } = require('../../../infra/v2/allergies.repository');
const { PrescriptionsRepository } = require('../../../infra/v2/prescriptions.repository');
const { DoctorsRepository } = require('../../../infra/v2/doctors.repository');
const { EncountersRepository } = require('../../../infra/v2/encounters.repository');
const { DoctorContextService } = require('../../../core/v2/doctorContext.service');
const { AuditService } = require('../../../core/v2/audit.service');
const { AuditRepository } = require('../../../infra/v2/audit.repository');
const { AuditConsoleRepository } = require('../../../infra/v2/audit.console.repository');
const auditConfig = require('../../../config/audit');
const { buildAuditContext, safeAudit } = require('../audit/audit.helpers');

const doctorContext = new DoctorContextService({
  doctorsRepository: new DoctorsRepository(),
  encountersRepository: new EncountersRepository(),
});

const service = new PatientsService({
  patientsRepository: new PatientsRepository(),
  allergiesRepository: new AllergiesRepository(),
  prescriptionsRepository: new PrescriptionsRepository(),
  doctorContext,
});
const auditRepository = auditConfig.sink === 'console' ? new AuditConsoleRepository() : new AuditRepository();
const auditService = new AuditService({ auditRepository });

exports.search = async (req, res, next) => {
  try {
    const results = await service.search({
      doctorUserId: req.user.sub,
      name: req.query.name,
      dob: req.query.dob,
      limit: req.query.limit,
    });
    const auditContext = buildAuditContext(req);
    await Promise.all(
      results.map((patient) =>
        safeAudit(auditService, {
          ...auditContext,
          eventType: 'patient_search_result',
          subjectType: 'patient',
          subjectId: patient.id,
          metadata: {
            ...auditContext.metadata,
            query: {
              name: req.query.name,
              dob: req.query.dob,
            },
          },
        })
      )
    );
    return res.json({ results });
  } catch (err) {
    return next(err);
  }
};

exports.getPatient = async (req, res, next) => {
  try {
    const patient = await service.getById({
      doctorUserId: req.user.sub,
      patientId: req.params.id,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'patient_view',
      subjectType: 'patient',
      subjectId: patient.id,
    });
    return res.json(patient);
  } catch (err) {
    return next(err);
  }
};

exports.getSummary = async (req, res, next) => {
  try {
    const summary = await service.getSummary({
      doctorUserId: req.user.sub,
      patientId: req.params.id,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'patient_summary_view',
      subjectType: 'patient',
      subjectId: summary.patient.id,
      metadata: {
        ...auditContext.metadata,
        allergiesCount: summary.allergies.length,
        prescriptionsCount: summary.prescriptions.length,
      },
    });
    return res.json(summary);
  } catch (err) {
    return next(err);
  }
};

exports.getPrescriptions = async (req, res, next) => {
  try {
    const prescriptions = await service.getPrescriptions({
      doctorUserId: req.user.sub,
      patientId: req.params.id,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'patient_prescriptions_view',
      subjectType: 'patient',
      subjectId: req.params.id,
      metadata: {
        ...auditContext.metadata,
        count: prescriptions.length,
      },
    });
    return res.json({ prescriptions });
  } catch (err) {
    return next(err);
  }
};
