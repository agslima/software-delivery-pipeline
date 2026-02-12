const { PrescriptionsService } = require('../../../core/v2/prescriptions.service');
const { PrescriptionsRepository } = require('../../../infra/v2/prescriptions.repository');
const { PatientsRepository } = require('../../../infra/v2/patients.repository');
const { EncountersRepository } = require('../../../infra/v2/encounters.repository');
const { MedicationsRepository } = require('../../../infra/v2/medications.repository');
const { DoctorsRepository } = require('../../../infra/v2/doctors.repository');
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

const service = new PrescriptionsService({
  prescriptionsRepository: new PrescriptionsRepository(),
  patientsRepository: new PatientsRepository(),
  encountersRepository: new EncountersRepository(),
  medicationsRepository: new MedicationsRepository(),
  doctorContext,
});
const auditRepository = auditConfig.sink === 'console' ? new AuditConsoleRepository() : new AuditRepository();
const auditService = new AuditService({ auditRepository });

exports.create = async (req, res, next) => {
  try {
    const prescription = await service.create({
      doctorUserId: req.user.sub,
      payload: req.body,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'prescription_created',
      subjectType: 'prescription',
      subjectId: prescription.id,
      metadata: {
        ...auditContext.metadata,
        patientId: prescription.patient.id,
      },
    });
    return res.status(201).json(prescription);
  } catch (err) {
    return next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const prescription = await service.getById({
      doctorUserId: req.user.sub,
      prescriptionId: req.params.id,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'prescription_view',
      subjectType: 'prescription',
      subjectId: prescription.id,
      metadata: {
        ...auditContext.metadata,
        patientId: prescription.patient.id,
      },
    });
    return res.json(prescription);
  } catch (err) {
    return next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const prescription = await service.update({
      doctorUserId: req.user.sub,
      prescriptionId: req.params.id,
      updates: req.body,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'prescription_updated',
      subjectType: 'prescription',
      subjectId: prescription.id,
      metadata: {
        ...auditContext.metadata,
        status: prescription.status,
      },
    });
    return res.json(prescription);
  } catch (err) {
    return next(err);
  }
};
