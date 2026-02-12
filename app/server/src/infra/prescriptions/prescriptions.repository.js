const db = require('../db/knex');
const env = require('../../config/env');

const mockPrescriptions = {
  'demo-id': {
    id: 'demo-id',
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

class PrescriptionsRepository {
  async findById(id) {
    if (env.NODE_ENV === 'test') {
      return mockPrescriptions[id] || null;
    }

    const row = await db('prescriptions').where({ id }).first();
    if (!row) return null;

    return {
      id: row.id,
      clinicName: row.clinic_name,
      date: row.date,
      doctor: row.doctor,
      patient: row.patient,
      medications: row.medications,
    };
  }
}

module.exports = { PrescriptionsRepository };
