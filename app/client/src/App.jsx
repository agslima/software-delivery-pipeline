import { useEffect, useState } from 'react';
import {
  loginPatient,
  verifyMfa,
  getMyPrescription,
  getMyPrescriptions,
  getMfaStatus,
  enrollMfa,
  disableMfa,
} from './api/patientPortalApi';
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
  const [loadingList, setLoadingList] = useState(() => Boolean(readSession()?.token));
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [portalError, setPortalError] = useState(null);
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaStatus, setMfaStatus] = useState(null);
  const [mfaEnrollData, setMfaEnrollData] = useState(null);
  const [mfaEnrollLoading, setMfaEnrollLoading] = useState(false);
  const [mfaEnrollError, setMfaEnrollError] = useState(null);
  const [mfaVerifyLoading, setMfaVerifyLoading] = useState(false);
  const [mfaVerifyError, setMfaVerifyError] = useState(null);
  const [mfaBanner, setMfaBanner] = useState(null);

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
    setLoadingList(false);
    setLoadingDetail(false);
    setPortalError(null);
    setMfaChallenge(null);
    setMfaStatus(null);
    setMfaEnrollData(null);
    setMfaEnrollLoading(false);
    setMfaEnrollError(null);
    setMfaVerifyLoading(false);
    setMfaVerifyError(null);
    setMfaBanner(null);
  };

  const handleLogin = async (email, password) => {
    const result = await loginPatient(email, password);
    if (result?.mfaRequired) {
      setMfaChallenge({
        mfaToken: result.mfaToken,
        user: result.user,
        email,
      });
      throw new Error('MFA_REQUIRED');
    }
    setLoadingList(true);
    setLoadingDetail(false);
    setPortalError(null);
    setPrescriptions([]);
    setSelectedId(null);
    setPrescriptionDetail(null);
    setSession(result);
  };

  const handleVerifyMfa = async (code) => {
    if (!mfaChallenge?.mfaToken) {
      throw new Error('SERVER_ERROR');
    }
    const result = await verifyMfa(code, mfaChallenge.mfaToken);
    setMfaChallenge(null);
    setLoadingList(true);
    setLoadingDetail(false);
    setPortalError(null);
    setPrescriptions([]);
    setSelectedId(null);
    setPrescriptionDetail(null);
    setSession({ token: result.token, user: mfaChallenge.user });
  };

  const handleCancelMfa = () => {
    setMfaChallenge(null);
  };

  const handleSelect = (id) => {
    if (!id) {
      setSelectedId(null);
      setPrescriptionDetail(null);
      setLoadingDetail(false);
      return;
    }

    setPortalError(null);
    setPrescriptionDetail(null);
    setLoadingDetail(true);
    setSelectedId(id);
  };

  useEffect(() => {
    if (!session?.token) return;

    let isActive = true;

    getMyPrescriptions(session.token)
      .then((data) => {
        if (!isActive) return;
        const list = data.prescriptions || [];
        setPrescriptions(list);
        if (list.length === 0) {
          handleSelect(null);
          return;
        }
        handleSelect(list[0]?.id || null);
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
    if (!session?.token) return;
    let isActive = true;

    getMfaStatus(session.token)
      .then((data) => {
        if (isActive) setMfaStatus(data);
      })
      .catch((err) => {
        if (!isActive) return;
        if (err.message === 'SESSION_EXPIRED') {
          handleLogout();
        }
      });

    return () => {
      isActive = false;
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token || !selectedId) return;

    let isActive = true;

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

  const handleEnrollMfa = async () => {
    if (!session?.token) return;
    setMfaEnrollLoading(true);
    setMfaEnrollError(null);
    setMfaBanner(null);
    try {
      const result = await enrollMfa(session.token, session.user?.email || 'StayHealthy');
      setMfaEnrollData(result);
      setMfaStatus({ configured: true, enabled: false });
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') {
        handleLogout();
        return;
      }
      setMfaEnrollError('Unable to start MFA enrollment.');
    } finally {
      setMfaEnrollLoading(false);
    }
  };

  const handleVerifyMfaNow = async (code) => {
    if (!session?.token) return;
    setMfaVerifyLoading(true);
    setMfaVerifyError(null);
    setMfaBanner(null);
    try {
      const result = await verifyMfa(code, session.token);
      setSession({ token: result.token, user: session.user });
      setMfaStatus({ configured: true, enabled: true });
      setMfaEnrollData(null);
      setMfaBanner('Multi-factor authentication enabled.');
    } catch (err) {
      if (err.message === 'INVALID_MFA_CODE') {
        setMfaVerifyError('Invalid verification code.');
      } else if (err.message === 'SESSION_EXPIRED') {
        handleLogout();
      } else {
        setMfaVerifyError('Unable to verify MFA code.');
      }
    } finally {
      setMfaVerifyLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!session?.token) return;
    setMfaEnrollError(null);
    setMfaVerifyError(null);
    setMfaBanner(null);
    try {
      await disableMfa(session.token);
      setMfaStatus({ configured: false, enabled: false });
      setMfaEnrollData(null);
      setMfaBanner('Multi-factor authentication disabled.');
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') {
        handleLogout();
        return;
      }
      setMfaEnrollError('Unable to disable MFA.');
    }
  };

  if (!session?.token) {
    return (
      <PatientLogin
        onLogin={handleLogin}
        onVerifyMfa={handleVerifyMfa}
        mfaChallenge={mfaChallenge}
        onCancelMfa={handleCancelMfa}
      />
    );
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
      onSelect={handleSelect}
      onLogout={handleLogout}
      loadingList={loadingList}
      loadingDetail={loadingDetail}
      portalError={portalError}
      mfaStatus={mfaStatus}
      mfaEnrollData={mfaEnrollData}
      mfaEnrollLoading={mfaEnrollLoading}
      mfaEnrollError={mfaEnrollError}
      onEnrollMfa={handleEnrollMfa}
      mfaVerifyLoading={mfaVerifyLoading}
      mfaVerifyError={mfaVerifyError}
      onVerifyMfaNow={handleVerifyMfaNow}
      mfaBanner={mfaBanner}
      onDisableMfa={handleDisableMfa}
    />
  );
}
