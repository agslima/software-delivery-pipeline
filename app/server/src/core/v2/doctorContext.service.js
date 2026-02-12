const { AppError } = require('../../api/http/errors/AppError');

class DoctorContextService {
  constructor({ doctorsRepository, encountersRepository }) {
    this.doctorsRepository = doctorsRepository;
    this.encountersRepository = encountersRepository;
  }

  async getDoctorByUserId(userId) {
    const doctor = await this.doctorsRepository.findByUserId(userId);
    if (!doctor) {
      throw new AppError({ status: 403, code: 'NOT_AUTHORIZED', message: 'Doctor access required' });
    }
    return doctor;
  }

  async ensurePatientAccess({ doctorId, patientId, status = 'open' }) {
    const allowed = await this.encountersRepository.existsForDoctorPatient({
      doctorId,
      patientId,
      status,
    });

    if (!allowed) {
      throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Access to patient denied' });
    }
  }
}

module.exports = { DoctorContextService };
