import { useEffect, useState } from 'react';
import { loginPatient, getMyPrescription, getMyPrescriptions } from './api/patientPortalApi';
import PatientLogin from './components/PatientLogin';
import PatientPortal from './components/PatientPortal';
import './styles/Portal.css';

const SESSION_KEY = 'stayhealthy_patient_session';

const readSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function App() {
  const [session, setSession] = useState(readSession);
  const [prescriptions, setPrescriptions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [prescriptionDetail, setPrescriptionDetail] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [portalError, setPortalError] = useState(null);

  useEffect(() => {
    if (session) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  const handleLogout = () => {
    setSession(null);
    setPrescriptions([]);
    setSelectedId(null);
    setPrescriptionDetail(null);
    setPortalError(null);
  };

  const handleLogin = async (email, password) => {
    const result = await loginPatient(email, password);
    setSession(result);
  };

  useEffect(() => {
    if (!session?.token) return;

    let isActive = true;
    setLoadingList(true);
    setPortalError(null);
    setPrescriptionDetail(null);

    getMyPrescriptions(session.token)
      .then((data) => {
        if (!isActive) return;
        const list = data.prescriptions || [];
        setPrescriptions(list);
        setSelectedId(list[0]?.id || null);
      })
      .catch((err) => {
        if (!isActive) return;
        if (err.message === 'SESSION_EXPIRED') {
          handleLogout();
        } else {
          setPortalError('Unable to load prescriptions.');
        }
      })
      .finally(() => {
        if (isActive) setLoadingList(false);
      });

    return () => {
      isActive = false;
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token || !selectedId) return;

    let isActive = true;
    setLoadingDetail(true);
    setPortalError(null);
    setPrescriptionDetail(null);

    getMyPrescription(selectedId, session.token)
      .then((data) => {
        if (isActive) setPrescriptionDetail(data);
      })
      .catch((err) => {
        if (!isActive) return;
        if (err.message === 'SESSION_EXPIRED') {
          handleLogout();
        } else if (err.message === 'FORBIDDEN') {
          setPortalError('Access denied for this prescription.');
        } else if (err.message === 'NOT_FOUND') {
          setPortalError('Prescription not found.');
        } else {
          setPortalError('Unable to load prescription details.');
        }
      })
      .finally(() => {
        if (isActive) setLoadingDetail(false);
      });

    return () => {
      isActive = false;
    };
  }, [selectedId, session?.token]);

  if (!session?.token) {
    return <PatientLogin onLogin={handleLogin} />;
  }

  if (session.user?.role !== 'patient') {
    return (
      <div className="portal-shell">
        <div className="portal-card portal-card--center">
          <h2>Patient Portal Access Only</h2>
          <p className="portal-muted">
            Your account is not configured as a patient. Please sign in with a patient account.
          </p>
          <button className="portal-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <PatientPortal
      user={session.user}
      prescriptions={prescriptions}
      selectedId={selectedId}
      prescriptionDetail={prescriptionDetail}
      onSelect={setSelectedId}
      onLogout={handleLogout}
      loadingList={loadingList}
      loadingDetail={loadingDetail}
      portalError={portalError}
    />
  );
}
