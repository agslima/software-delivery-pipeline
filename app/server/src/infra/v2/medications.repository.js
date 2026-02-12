const db = require('../db/knex');

class MedicationsRepository {
  async findByIds(ids) {
    if (!ids || ids.length === 0) return [];
    return db
      .withSchema('v2').from('medications_catalog')
      .whereIn('id', ids)
      .select('id', 'name', 'form', 'strength', 'rxnorm_code', 'is_active');
  }

  async search(query, limit = 20) {
    return db
      .withSchema('v2').from('medications_catalog')
      .whereILike('name', `%${query}%`)
      .andWhere('is_active', true)
      .orderBy('name')
      .limit(limit)
      .select('id', 'name', 'form', 'strength', 'rxnorm_code', 'is_active');
  }
}

module.exports = { MedicationsRepository };
