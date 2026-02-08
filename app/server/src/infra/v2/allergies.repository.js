const db = require('../db/knex');

class AllergiesRepository {
  async findByPatientId(patientId) {
    return db
      .withSchema('v2').from('allergies')
      .where({ patient_id: patientId })
      .orderBy('created_at', 'desc');
  }
}

module.exports = { AllergiesRepository };
