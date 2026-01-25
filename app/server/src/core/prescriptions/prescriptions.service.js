const { AppError } = require('../../api/http/errors/AppError');

class PrescriptionsService {
  constructor(repo) {
    this.repo = repo;
  }

  async getById(id) {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Prescription not found' });
    }
    return item;
  }
}

module.exports = { PrescriptionsService };

