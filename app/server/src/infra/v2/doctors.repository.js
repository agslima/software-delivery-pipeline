const db = require('../db/knex');

class DoctorsRepository {
  async findById(id) {
    return db
      .withSchema('v2')
      .select(
        'd.id',
        'd.user_id',
        'd.first_name',
        'd.last_name',
        'd.license_number',
        'd.specialty',
        'd.phone',
        'd.email',
        'u.email as user_email',
        'u.role as user_role',
        'u.mfa_enabled'
      )
      .from('doctors as d')
      .join('users as u', 'd.user_id', 'u.id')
      .where('d.id', id)
      .first();
  }

  async findByUserId(userId) {
    return db
      .withSchema('v2')
      .select(
        'd.id',
        'd.user_id',
        'd.first_name',
        'd.last_name',
        'd.license_number',
        'd.specialty',
        'd.phone',
        'd.email',
        'u.email as user_email',
        'u.role as user_role',
        'u.mfa_enabled'
      )
      .from('doctors as d')
      .join('users as u', 'd.user_id', 'u.id')
      .where('u.id', userId)
      .first();
  }
}

module.exports = { DoctorsRepository };
