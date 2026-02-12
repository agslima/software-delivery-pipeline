const db = require('../db/knex');

class RefreshTokensRepository {
  constructor(dbInstance) {
    this.db = dbInstance || db;
  }

  create({ id, userId, tokenHash, expiresAt }) {
    return this.db
      .withSchema('v2')
      .insert({
        id,
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .into('refresh_tokens');
  }

  findByTokenHash(tokenHash) {
    if (!tokenHash) return null;
    return this.db.withSchema('v2').from('refresh_tokens').where({ token_hash: tokenHash }).first();
  }

  revoke(id, revokedAt = new Date()) {
    return this.db
      .withSchema('v2')
      .from('refresh_tokens')
      .where({ id })
      .update({ revoked_at: revokedAt });
  }

  revokeByTokenHash(tokenHash, revokedAt = new Date()) {
    if (!tokenHash) return 0;
    return this.db
      .withSchema('v2')
      .from('refresh_tokens')
      .where({ token_hash: tokenHash })
      .whereNull('revoked_at')
      .update({ revoked_at: revokedAt });
  }

  revokeAllForUser(userId, revokedAt = new Date()) {
    if (!userId) return 0;
    return this.db
      .withSchema('v2')
      .from('refresh_tokens')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .update({ revoked_at: revokedAt });
  }
}

module.exports = { RefreshTokensRepository };
