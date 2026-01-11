//const data = require('./prescription.mock.json');

//class PrescriptionService {
//  static getById(id) {
//    const prescription = data.find(p => p.id === id);

//    if (!prescription) {
//      const error = new Error('Prescription not found');
//      error.statusCode = 404;
//      throw error;
//    }

//    return prescription;
// }
//}

const prescriptions = {
  'demo-id': {
    clinicName: 'StayHealthy',
    doctor: { name: 'Dr. Emily Johnson' },
    patient: { name: 'John Smith' },
    medications: []
  }
};

class PrescriptionService {
  static async getById(id) {
    const prescription = prescriptions[id];

    if (!prescription) {
      const err = new Error('Prescription not found');
      err.statusCode = 404;
      throw err;
    }

    return prescription;
  }
}

module.exports = PrescriptionService;

