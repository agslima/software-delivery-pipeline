const prescriptions = {
  'demo-id': {
    clinicName: 'StayHealthy',
    date: 'July 10, 2023',
    doctor: {
      name: 'Dr. Emily Johnson',
      license: '12345',
      phone: '(555) 987-6543',
      email: 'dr.emily@example.com',
    },
    patient: {
      name: 'John Smith',
      gender: 'Male',
      dob: 'January 15, 1980',
      phone: '(555) 123-4567',
      email: 'johnsmith@example.com',
    },
    medications: [
      {
        name: 'Amoxicillin',
        dosage: '500mg',
        directions: 'Take 1 capsule three times a day with meals.',
        quantity: '30 capsules',
      },
      {
        name: 'Ibuprofen',
        dosage: '200mg',
        directions: 'Take 1 tablet every 6 hours as needed for pain.',
        quantity: '60 tablets',
      },
      {
        name: 'Loratadine',
        dosage: '10mg',
        directions: 'Take 1 tablet once daily in the morning.',
        quantity: '30 tablets',
      },
    ],
  },
};

class PrescriptionService {
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
