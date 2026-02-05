class UsersRepository {
  constructor(db) {
    this.db = db || require('../db/knex');
  }

  async findByEmail(email) {
    if (!email) return null;
    return this.db.withSchema('v2')('users').where({ email }).first();
  }

  async findById(id) {
    if (!id) return null;
    return this.db.withSchema('v2')('users').where({ id }).first();
  }

  async setMfaEnabled(id, enabled) {
    return this.db.withSchema('v2')('users').where({ id }).update({ mfa_enabled: enabled });
  }

  async setMfaSecret(id, secret) {
    return this.db.withSchema('v2')('users').where({ id }).update({ mfa_secret: secret });
  }
}

module.exports = { UsersRepository };
