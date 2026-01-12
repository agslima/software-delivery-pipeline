// Mock Database matching the uploaded PDF
const prescriptions = {
  'demo-id': {
    clinicName: 'StayHealthy', // [cite: 1]
    date: 'July 10, 2023', // [cite: 1]
    doctor: { 
      name: 'Dr. Emily Johnson', // [cite: 1]
      license: '12345', // [cite: 1]
      phone: '(555) 987-6543', // [cite: 1]
      email: 'dr.emily@example.com' // [cite: 1]
    },
    patient: { 
      name: 'John Smith', // [cite: 4]
      gender: 'Male', // [cite: 4]
      dob: 'January 15, 1980', // [cite: 4]
      phone: '(555) 123-4567', // [cite: 4]
      email: 'johnsmith@example.com' // [cite: 4]
    },
    medications: [
      { 
        name: 'Amoxicillin', 
        dosage: '500mg', 
        directions: 'Take 1 capsule three times a day with meals.',
        quantity: '30 capsules'
      }, // [cite: 1, 2]
      { 
        name: 'Ibuprofen', 
        dosage: '200mg', 
        directions: 'Take 1 tablet every 6 hours as needed for pain.',
        quantity: '60 tablets'
      }, // [cite: 2, 3]
      { 
        name: 'Loratadine', 
        dosage: '10mg', 
        directions: 'Take 1 tablet once daily in the morning.',
        quantity: '30 tablets'
      } // [cite: 3, 5]
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