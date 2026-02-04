import { useState } from 'react';

export default function PatientLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
          <h2>Sign In</h2>
          <p className="portal-muted">Use your patient email and password.</p>
          <form onSubmit={handleSubmit} className="portal-form">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="john.smith@stayhealthy.test"
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
            Demo user: <span>john.smith@stayhealthy.test</span> · Password: <span>DemoPass123!</span>
          </div>
        </div>
      </div>
    </div>
  );
}
