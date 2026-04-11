const { ExportJobsService } = require('../../../core/v2/exportJobs.service');
const { ExportJobsRepository } = require('../../../infra/v2/exportJobs.repository');
const { PrescriptionsRepository } = require('../../../infra/v2/prescriptions.repository');
const { EncountersRepository } = require('../../../infra/v2/encounters.repository');
const { DoctorsRepository } = require('../../../infra/v2/doctors.repository');
const { DoctorContextService } = require('../../../core/v2/doctorContext.service');

const doctorContext = new DoctorContextService({
  doctorsRepository: new DoctorsRepository(),
  encountersRepository: new EncountersRepository(),
});

const service = new ExportJobsService({
  exportJobsRepository: new ExportJobsRepository(),
  prescriptionsRepository: new PrescriptionsRepository(),
  doctorContext,
});

exports.getById = async (req, res, next) => {
  try {
    const job = await service.getById({
      doctorUserId: req.user.sub,
      jobId: req.params.id,
    });
    return res.json(job);
  } catch (error) {
    return next(error);
  }
};
