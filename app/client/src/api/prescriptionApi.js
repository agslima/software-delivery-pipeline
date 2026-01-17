export async function login(username, password) {
  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    // 1. Handle "Wrong Password" specifically
    if (response.status === 401) {
      throw new Error('INCORRECT_CREDENTIALS');
    }

    // 2. Handle Server Errors (500, 502, etc.)
    if (!response.ok) {
      throw new Error('SERVER_ERROR');
    }

    const data = await response.json();
    return data.token;

  } catch (err) {
    // 3. Handle Network Errors (Server offline / Docker down)
    if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
      throw new Error('NETWORK_ERROR');
    }
    throw err;
  }
}

export async function getPrescription(id, token) {
  const response = await fetch(`/api/v1/prescriptions/${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
     if (response.status === 401) throw new Error('SESSION_EXPIRED');
     throw new Error('SERVER_ERROR');
  }
  return response.json();
}