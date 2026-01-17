import { useState } from 'react';
import '../styles/Prescription.css';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {      
      await onLogin(username, password);
    } catch (err) {
      if (err.message === 'INCORRECT_CREDENTIALS') {
        setErrorMsg('Incorrect username or password. Please try again.');
      } 
      // Handle network or other errors
      else if (err.message === 'NETWORK_ERROR') {
        setErrorMsg('Cannot reach the server. Is the backend running?');
      } 
      // Fallback
      else {
        setErrorMsg('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '400px', marginTop: '100px' }}>
      <header className="header" style={{ justifyContent: 'center' }}>
        <div className="brand">Medical Portal</div>
      </header>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="username" style={{ display: 'block', marginBottom: '5px' }}>
            Username
          </label>
          <input 
            id="username"
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            required
            disabled={isLoading} 
          />
        </div>

        <div style={{ marginBottom: '20px' }}>          
          <label htmlFor="password" style={{ display: 'block', marginBottom: '5px' }}>
            Password
          </label>
          <input 
            id="password"
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            required
            disabled={isLoading} 
          />
        </div>

        {/* Error Banner: Only renders if errorMsg exists */}
        {errorMsg && (
            <div className="error-banner" style={{marginBottom: '15px', color: 'red', fontWeight: 'bold'}}>
                {errorMsg}
            </div>
        )}

        <button 
          type="submit" 
          className="print-btn" 
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          disabled={isLoading}
        >
          {isLoading ? <span className="spinner"></span> : 'Secure Login'}
        </button>
      </form>
    </div>
  );
}