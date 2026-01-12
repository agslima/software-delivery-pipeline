// Mock Database
const prescriptions = {
  'demo-id': {
    clinicName: 'StayHealthy',
    doctor: { name: 'Dr. Emily Johnson' },
    patient: { name: 'John Smith' },
    medications: [
      { name: 'Amoxicillin', dosage: '500mg' }
    ]
  }
};

class PrescriptionService {

  constructor() {}

  async getById(id) {
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
