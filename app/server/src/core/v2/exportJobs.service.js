const env = require('../../config/env');
const { AppError } = require('../../api/http/errors/AppError');

class ExportJobsService {
  constructor({ exportJobsRepository, prescriptionsRepository, doctorContext }) {
    this.exportJobsRepository = exportJobsRepository;
    this.prescriptionsRepository = prescriptionsRepository;
    this.doctorContext = doctorContext;
  }

  async enqueue({ doctorUserId, prescriptionId, format = 'json' }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    const prescription = await this.prescriptionsRepository.findById(prescriptionId);

    if (!prescription) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Prescription not found' });
    }

    if (prescription.doctor.id !== doctor.id) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only the prescribing doctor can export this prescription',
      });
    }

    const updatedAt = prescription.updatedAt instanceof Date ? prescription.updatedAt.toISOString() : String(prescription.updatedAt);
    const idempotencyKey = `${prescription.id}:${format}:${updatedAt}`;

    return this.exportJobsRepository.enqueueOrReuse({
      prescriptionId,
      doctorId: doctor.id,
      format,
      maxAttempts: env.EXPORT_JOB_MAX_ATTEMPTS,
      idempotencyKey,
    });
  }

  async getById({ doctorUserId, jobId }) {
    const doctor = await this.doctorContext.getDoctorByUserId(doctorUserId);
    const job = await this.exportJobsRepository.findById(jobId, { doctorId: doctor.id });

    if (!job) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Export job not found' });
    }

    return job;
  }
}

module.exports = { ExportJobsService };
