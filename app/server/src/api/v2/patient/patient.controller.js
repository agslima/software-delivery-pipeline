const { PatientPortalService } = require('../../../core/v2/patientPortal.service');
const { PatientsRepository } = require('../../../infra/v2/patients.repository');
const { PrescriptionsRepository } = require('../../../infra/v2/prescriptions.repository');
const { AuditService } = require('../../../core/v2/audit.service');
const { AuditRepository } = require('../../../infra/v2/audit.repository');
const { AuditConsoleRepository } = require('../../../infra/v2/audit.console.repository');
const auditConfig = require('../../../config/audit');
const { buildAuditContext, safeAudit } = require('../audit/audit.helpers');

const service = new PatientPortalService({
  patientsRepository: new PatientsRepository(),
  prescriptionsRepository: new PrescriptionsRepository(),
});
const auditRepository = auditConfig.sink === 'console' ? new AuditConsoleRepository() : new AuditRepository();
const auditService = new AuditService({ auditRepository });

exports.listPrescriptions = async (req, res, next) => {
  try {
    const { patient, prescriptions } = await service.listPrescriptions(req.user.sub);
    const auditContext = buildAuditContext(req);

    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'patient_portal_prescriptions_view',
      subjectType: 'patient',
      subjectId: patient.id,
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

exports.getPrescription = async (req, res, next) => {
  try {
    const { patient, prescription } = await service.getPrescription(req.user.sub, req.params.id);
    const auditContext = buildAuditContext(req);

    await safeAudit(auditService, {
      ...auditContext,
      eventType: 'patient_portal_prescription_view',
      subjectType: 'prescription',
      subjectId: prescription.id,
      metadata: {
        ...auditContext.metadata,
        patientId: patient.id,
      },
    });

    return res.json(prescription);
  } catch (err) {
    return next(err);
  }
};
