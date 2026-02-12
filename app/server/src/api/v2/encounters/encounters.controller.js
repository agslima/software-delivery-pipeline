const { EncountersService } = require('../../../core/v2/encounters.service');
const { EncountersRepository } = require('../../../infra/v2/encounters.repository');
const { PatientsRepository } = require('../../../infra/v2/patients.repository');
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

const service = new EncountersService({
  encountersRepository: new EncountersRepository(),
  patientsRepository: new PatientsRepository(),
  doctorContext,
});
const auditRepository = auditConfig.sink === 'console' ? new AuditConsoleRepository() : new AuditRepository();
const auditService = new AuditService({ auditRepository });

exports.create = async (req, res, next) => {
  try {
    const encounter = await service.create({
      doctorUserId: req.user.sub,
      patientId: req.body.patientId,
      facilityId: req.body.facilityId,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'encounter_created',
      subjectType: 'encounter',
      subjectId: encounter.id,
      metadata: {
        ...auditContext.metadata,
        patientId: encounter.patientId,
      },
    });
    return res.status(201).json(encounter);
  } catch (err) {
    return next(err);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const encounter = await service.updateStatus({
      doctorUserId: req.user.sub,
      encounterId: req.params.id,
      status: req.body.status,
    });
    const auditContext = buildAuditContext(req);
    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'encounter_status_updated',
      subjectType: 'encounter',
      subjectId: encounter.id,
      metadata: {
        ...auditContext.metadata,
        status: encounter.status,
      },
    });
    return res.json(encounter);
  } catch (err) {
    return next(err);
  }
};
