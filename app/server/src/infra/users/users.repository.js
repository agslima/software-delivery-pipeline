const db = require('../db/knex');

class UsersRepository {
  async findByEmail(email) {
    if (!email) return null;
    return db.withSchema('v2')('users').where({ email }).first();
  }
}

module.exports = { UsersRepository };
