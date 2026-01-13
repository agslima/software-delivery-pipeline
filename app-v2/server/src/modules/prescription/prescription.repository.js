const db = require('../../config/database');

class PrescriptionRepository {
  async findById(id) {
    // Select from Postgres
    const row = await db('prescriptions')
      .where({ id })
      .first();

    if (!row) return null;

    // Map DB columns (snake_case) to Domain Entity (camelCase)
    return {
      id: row.id,
      clinicName: row.clinic_name,
      date: row.date,
      doctor: row.doctor,
      patient: row.patient,
      medications: row.medications
    };
  }
}

module.exports = PrescriptionRepository;