import { useEffect, useState } from 'react';
import { getPrescription, login } from './api/prescriptionApi';
import Login from './components/Login';
import './styles/global.css';
import './styles/Prescription.css';

export default function App() {
  const [token, setToken] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const handleLogin = async (username, password) => {
    // Pass the raw error up to the Login component to handle visuals
    const fetchedToken = await login(username, password);
    setToken(fetchedToken);
  };

  useEffect(() => {
    if (!token) return;

    // Reset data when token changes (handle re-login)
    setData(null);
    setError(null);

    getPrescription('demo-id', token)
      .then(setData)
      .catch(err => {
        if (err.message === 'SESSION_EXPIRED') {
            setToken(null); // Auto-logout
        } else {
            setError('Could not load patient record. ' + err.message);
        }
      });
  }, [token]);

  // 1. Show Login
  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  // 2. Show Main Loading Spinner (Fetching Data)
  if (!data && !error) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Decrypting patient record...</p>
      </div>
    );
  }

  // 3. Show Critical Error (if fetching failed)
  if (error) {
     return (
        <div className="container" style={{textAlign: 'center', marginTop: '50px'}}>
            <div className="error-banner">{error}</div>
            <button onClick={() => setToken(null)} className="print-btn">Back to Login</button>
        </div>
     );
  }

  // 4. Success UI (The Prescription)
  return (
    <div className="container">
      {/* ... (Keep your existing Prescription UI exactly as is) ... */}
       <button onClick={() => window.print()} className="print-btn">
        🖨️ Print Official Prescription
      </button>

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

      <footer className="footer">
        <p>If there are any concerns, please contact {data.doctor.name}.</p>
        <p>{data.clinicName} - Official Medical Record</p>
      </footer>
    </div>
  );
}