import { useEffect, useState } from 'react';
import { getPrescription } from './api/prescriptionApi';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPrescription('demo-id')
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  if (error) return <p>Error: {error}</p>;
  if (!data) return <p>Loading prescription...</p>;

  return (
    <div>
      <h1>{data.clinicName}</h1>

      <section>
        <h3>Doctor</h3>
        <p>{data.doctor.name}</p>
      </section>

      <section>
        <h3>Patient</h3>
        <p>{data.patient.name}</p>
      </section>

      <section>
        <h3>Medications</h3>
        <ul>
          {data.medications.map(med => (
            <li key={med.name}>
              <strong>{med.name}</strong> – {med.dosage}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
