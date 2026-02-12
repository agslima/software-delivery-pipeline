import { useState } from 'react';

export default function PatientLogin({ onLogin, onVerifyMfa, mfaChallenge, onCancelMfa }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      await onLogin(email, password);
    } catch (err) {
      if (err.message === 'INCORRECT_CREDENTIALS') {
        setErrorMsg('Incorrect email or password.');
      } else if (err.message === 'MFA_REQUIRED') {
        setErrorMsg(null);
      } else if (err.message === 'NETWORK_ERROR') {
        setErrorMsg('Cannot reach the server. Is the backend running?');
      } else {
        setErrorMsg('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (event) => {
    event.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      await onVerifyMfa(mfaCode);
    } catch (err) {
      if (err.message === 'INVALID_MFA_CODE') {
        setErrorMsg('Invalid verification code.');
      } else if (err.message === 'NETWORK_ERROR') {
        setErrorMsg('Cannot reach the server. Is the backend running?');
      } else {
        setErrorMsg('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="portal-shell">
      <div className="portal-hero">
        <div>
          <p className="portal-kicker">StayHealthy</p>
          <h1>Patient Prescription Portal</h1>
          <p className="portal-subtitle">
            Secure access to your active and past prescriptions.
          </p>
        </div>
        <div className="portal-card portal-card--login">
          {!mfaChallenge ? (
            <>
              <h2>Sign In</h2>
              <p className="portal-muted">Use your patient email and password.</p>
              <form onSubmit={handleSubmit} className="portal-form">
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="patient@example.test"
                    required
                    disabled={isLoading}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                  />
                </label>

                {errorMsg && <div className="portal-error">{errorMsg}</div>}

                <button className="portal-button" type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <span className="portal-inline">
                      <span className="portal-spinner" /> Signing in
                    </span>
                  ) : (
                    'Secure Login'
                  )}
                </button>
              </form>
              <div className="portal-footnote">
                Demo credentials are provisioned per environment.
              </div>
            </>
          ) : (
            <>
              <h2>Two-Factor Verification</h2>
              <p className="portal-muted">
                Enter the 6-digit code from your authenticator app.
              </p>
              <form onSubmit={handleMfaSubmit} className="portal-form">
                <label>
                  Verification Code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="123456"
                    required
                    disabled={isLoading}
                  />
                </label>

                {errorMsg && <div className="portal-error">{errorMsg}</div>}

                <button className="portal-button" type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <span className="portal-inline">
                      <span className="portal-spinner" /> Verifying
                    </span>
                  ) : (
                    'Verify'
                  )}
                </button>
              </form>
              <button className="portal-link" type="button" onClick={onCancelMfa} disabled={isLoading}>
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
