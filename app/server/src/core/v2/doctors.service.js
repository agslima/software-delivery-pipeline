const { AppError } = require('../../api/http/errors/AppError');

const mapDoctor = (row) => ({
  id: row.id,
  userId: row.user_id,
  firstName: row.first_name,
  lastName: row.last_name,
  licenseNumber: row.license_number,
  specialty: row.specialty,
  phone: row.phone,
  email: row.user_email || row.email,
  mfaEnabled: row.mfa_enabled,
});

class DoctorsService {
  constructor({ doctorsRepository }) {
    this.doctorsRepository = doctorsRepository;
  }

  async getMe(userId) {
    const doctor = await this.doctorsRepository.findByUserId(userId);
    if (!doctor) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Doctor not found' });
    }
    return mapDoctor(doctor);
  }

  async getById({ doctorId, requester }) {
    const doctor = await this.doctorsRepository.findById(doctorId);
    if (!doctor) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Doctor not found' });
    }

    if (requester.role !== 'admin' && doctor.user_id !== requester.sub) {
      throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' });
    }

    return mapDoctor(doctor);
  }
}

module.exports = { DoctorsService };
