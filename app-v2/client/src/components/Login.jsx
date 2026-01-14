import { useState } from 'react';
import '../styles/Prescription.css';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true); // Start Spinner

    try {
      // Simulate a tiny delay so the user sees the interaction 
      await new Promise(r => setTimeout(r, 500)); 
      
      await onLogin(username, password);
    } catch (err) {
      // Map Error Codes to User-Friendly Messages
      if (err.message === 'INCORRECT_CREDENTIALS') {
        setErrorMsg('Incorrect username or password. Please try again.');
      } else if (err.message === 'NETWORK_ERROR') {
        setErrorMsg('Cannot reach the server. Is the backend running?');
      } else {
        setErrorMsg('Something went wrong. Please contact support.');
      }
    } finally {
      setIsLoading(false); // Stop Spinner
    }
  };

  return (
    <div className="container" style={{ maxWidth: '400px', marginTop: '100px' }}>
      <header className="header" style={{ justifyContent: 'center' }}>
        <div className="brand">Medical Portal</div>
      </header>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Username</label>
          <input 
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            required
            disabled={isLoading} // Lock input while loading
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Password</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            required
            disabled={isLoading} // Lock input while loading
          />
        </div>

        {/* Error Banner */}
        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        <button 
          type="submit" 
          className="print-btn" 
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          disabled={isLoading} // Prevent double-click
        >
          {/* Show Spinner inside Button */}
          {isLoading ? <span className="spinner"></span> : 'Secure Login'}
        </button>
      </form>
    </div>
  );
}