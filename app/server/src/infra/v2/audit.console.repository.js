const logger = require('../../observability/logger');

class AuditConsoleRepository {
  async create(event) {
    logger.info({ audit: event }, 'AUDIT_EVENT');
  }

  async list() {
    return [];
  }
}

module.exports = { AuditConsoleRepository };
