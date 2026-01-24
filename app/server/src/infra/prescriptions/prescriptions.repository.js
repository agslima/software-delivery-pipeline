const db = require('../db/knex');

class PrescriptionsRepository {
  async findById(id) {
    const row = await db('prescriptions').where({ id }).first();
    if (!row) return null;

    return {
      id: row.id,
      clinicName: row.clinic_name,
      date: row.date,
      doctor: row.doctor,
      patient: row.patient,
      medications: row.medications,
    };
  }
}

module.exports = { PrescriptionsRepository };

