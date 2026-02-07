const db = require('../db/knex');

class PatientsRepository {
  async findById(id) {
    return db.withSchema('v2').from('patients').where({ id }).first();
  }

  async findByUserId(userId) {
    return db.withSchema('v2').from('patients').where({ user_id: userId }).first();
  }

  async searchForDoctor({ doctorId, name, dob, patientId, limit = 25, status = 'open' }) {
    const query = db
      .withSchema('v2')
      .select('p.*')
      .from('patients as p')
      .join('encounters as e', 'p.id', 'e.patient_id')
      .where('e.doctor_id', doctorId)
      .modify((qb) => {
        if (status) qb.andWhere('e.status', status);
      })
      .distinct();

    if (patientId) {
      query.andWhere('p.id', patientId);
    }

    if (dob) {
      query.andWhere('p.dob', dob);
    }

    if (name) {
      const tokens = name.trim().split(/\s+/).filter(Boolean);
      tokens.forEach((token) => {
        query.andWhere((qb) => {
          qb.whereILike('p.first_name', `%${token}%`).orWhereILike('p.last_name', `%${token}%`);
        });
      });
    }

    return query.orderBy('p.last_name').limit(limit);
  }
}

module.exports = { PatientsRepository };
