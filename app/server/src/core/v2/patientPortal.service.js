const { AppError } = require('../../api/http/errors/AppError');

class PatientPortalService {
  constructor({ patientsRepository, prescriptionsRepository }) {
    this.patientsRepository = patientsRepository;
    this.prescriptionsRepository = prescriptionsRepository;
  }

  async getPatientByUserId(userId) {
    const patient = await this.patientsRepository.findByUserId(userId);
    if (!patient) {
      throw new AppError({ status: 403, code: 'NOT_AUTHORIZED', message: 'Patient access required' });
    }
    return patient;
  }

  async listPrescriptions(userId) {
    const patient = await this.getPatientByUserId(userId);
    const prescriptions = await this.prescriptionsRepository.listByPatientId(patient.id);
    return { patient, prescriptions };
  }

  async getPrescription(userId, prescriptionId) {
    const patient = await this.getPatientByUserId(userId);
    const prescription = await this.prescriptionsRepository.findById(prescriptionId);

    if (!prescription) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Prescription not found' });
    }

    if (prescription.patient.id !== patient.id) {
      throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Access denied' });
    }

    return { patient, prescription };
  }
}

module.exports = { PatientPortalService };
