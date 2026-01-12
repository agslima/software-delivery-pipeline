// Helper to simulate login and get token
async function getAuthToken() {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password' })
  });

  if (!response.ok) throw new Error('Auth failed');
  const data = await response.json();
  return data.token;
}

export async function getPrescription(id) {
  // 1. Get Token first
  const token = await getAuthToken();

  // 2. Fetch Data with Authorization Header
  const response = await fetch(`/api/v1/prescriptions/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch prescription');
  }

  return response.json();
}
