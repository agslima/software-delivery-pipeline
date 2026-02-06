const db = require('../db/knex');

class EncountersRepository {
  async findById(id) {
    return db.withSchema('v2').from('encounters').where({ id }).first();
  }

  async findByDoctorPatient({ doctorId, patientId, status }) {
    return db
      .withSchema('v2').from('encounters')
      .where({ doctor_id: doctorId, patient_id: patientId })
      .modify((qb) => {
        if (status) qb.andWhere('status', status);
      })
      .orderBy('started_at', 'desc')
      .first();
  }

  async existsForDoctorPatient({ doctorId, patientId, status }) {
    const row = await db
      .withSchema('v2').from('encounters')
      .where({ doctor_id: doctorId, patient_id: patientId })
      .modify((qb) => {
        if (status) qb.andWhere('status', status);
      })
      .first('id');

    return Boolean(row);
  }

  async create(encounter) {
    await db.withSchema('v2').from('encounters').insert(encounter);
    return this.findById(encounter.id);
  }

  async update(id, updates) {
    await db.withSchema('v2').from('encounters').where({ id }).update(updates);
    return this.findById(id);
  }
}

module.exports = { EncountersRepository };
