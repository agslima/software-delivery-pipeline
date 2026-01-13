export async function login(username, password) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) throw new Error('Invalid credentials');
  
  const data = await response.json();
  return data.token;
}

export async function getPrescription(id, token) {
  const response = await fetch(`/api/v1/prescriptions/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to fetch prescription');
  }

  return response.json();
}