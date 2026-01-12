import { useEffect, useState } from 'react';
import { getPrescription } from './api/prescriptionApi';
import './styles/global.css';
import './styles/Prescription.css'; // Import the new styles

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetches securely using the 'demo-id'
    getPrescription('demo-id')
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div className="error">Authentication Error: {error}</div>;
  if (!data) return <div className="loading">Securely loading patient record...</div>;

  return (
    <div className="container">
      {/* Print Button (Visible only on screen) */}
      <button onClick={() => window.print()} className="print-btn">
        🖨️ Print Official Prescription
      </button>

      {/* Header matching PDF Source [1] */}
      <header className="header">
        <div>
          <div className="brand">{data.clinicName}</div>
          <div style={{ marginTop: '10px' }}>
            <strong>{data.doctor.name}</strong><br/>
            License: {data.doctor.license}<br/>
            {data.doctor.phone} | {data.doctor.email}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong>Date:</strong> {data.date}
        </div>
      </header>

      {/* Patient Info matching PDF Source [4] */}
      <section className="info-grid">
        <div>
          <div className="section-title">Patient Details</div>
          <p>
            <strong>Name:</strong> {data.patient.name}<br/>
            <strong>DOB:</strong> {data.patient.dob}<br/>
            <strong>Gender:</strong> {data.patient.gender}
          </p>
        </div>
        <div>
          <div className="section-title">Contact</div>
          <p>
            {data.patient.phone}<br/>
            {data.patient.email}
          </p>
        </div>
      </section>

      {/* Medications matching PDF Sources [1,2,3,5] */}
      <section>
        <div className="section-title">Prescribed Medications</div>
        {data.medications.map((med, index) => (
          <div key={index} className="medication-card">
            <div className="medication-name">
              {med.name}
              <span>{med.dosage}</span>
            </div>
            <p><strong>Directions:</strong> {med.directions}</p>
            <p><strong>Quantity:</strong> {med.quantity}</p>
          </div>
        ))}
      </section>

      {/* Footer matching PDF Source [7] */}
      <footer className="footer">
        <p>If there are any concerns, please contact {data.doctor.name}.</p>
        <p>{data.clinicName} - Official Medical Record</p>
      </footer>
    </div>
  );
}