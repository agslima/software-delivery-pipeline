exports.seed = async function(knex) {
  await knex('prescriptions').del();

  // 2. Insert demo data
  await knex('prescriptions').insert([
    {
      id: 'demo-id',
      clinic_name: 'StayHealthy',
      date: 'July 10, 2023',
      doctor: JSON.stringify({ 
        name: 'Dr. Emily Johnson', 
        license: '12345', 
        phone: '(555) 987-6543', 
        email: 'dr.emily@example.com' 
      }),
      patient: JSON.stringify({ 
        name: 'John Smith', 
        gender: 'Male', 
        dob: 'January 15, 1980', 
        phone: '(555) 123-4567', 
        email: 'johnsmith@example.com' 
      }),
      medications: JSON.stringify([
        { name: 'Amoxicillin', dosage: '500mg', directions: 'Take 1 capsule three times a day.', quantity: '30 capsules' },
        { name: 'Ibuprofen', dosage: '200mg', directions: 'Take 1 tablet every 6 hours.', quantity: '60 tablets' },
        { name: 'Loratadine', dosage: '10mg', directions: 'Take 1 tablet once daily.', quantity: '30 tablets' },
      ]),
    }
  ]);
};
