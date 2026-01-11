const data = require('./prescription.mock.json');

class PrescriptionService {
  static getById(id) {
    const prescription = data.find(p => p.id === id);

    if (!prescription) {
      const error = new Error('Prescription not found');
      error.statusCode = 404;
      throw error;
    }

    return prescription;
  }
}

module.exports = PrescriptionService;
