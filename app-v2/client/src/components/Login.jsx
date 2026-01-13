import { useState } from 'react';
import '../styles/Prescription.css'; 

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      await onLogin(username, password);
    } catch (err) {
      setError('Invalid username or password');
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
          />
        </div>

        {error && <div style={{ color: 'red', marginBottom: '15px' }}>{error}</div>}

        <button type="submit" className="print-btn" style={{ width: '100%' }}>
          Secure Login
        </button>
      </form>
    </div>
  );
}