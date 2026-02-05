export async function loginPatient(email, password) {
  try {
    const response = await fetch('/api/v2/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) {
      throw new Error('INCORRECT_CREDENTIALS');
    }

    if (!response.ok) {
      throw new Error('SERVER_ERROR');
    }

    const data = await response.json();
    if (data?.mfaRequired) {
      return {
        mfaRequired: true,
        mfaToken: data.mfaToken,
        user: data.user,
      };
    }
    return {
      token: data.accessToken,
      user: data.user,
    };
  } catch (err) {
    if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
      throw new Error('NETWORK_ERROR');
    }
    throw err;
  }
}

export async function verifyMfa(code, mfaToken) {
  try {
    const response = await fetch('/api/v2/auth/mfa/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mfaToken}`,
      },
      body: JSON.stringify({ code }),
    });

    if (response.status === 400) {
      throw new Error('INVALID_MFA_CODE');
    }

    if (!response.ok) {
      throw new Error('SERVER_ERROR');
    }

    const data = await response.json();
    return {
      token: data.accessToken,
      refreshToken: data.refreshToken,
    };
  } catch (err) {
    if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
      throw new Error('NETWORK_ERROR');
    }
    throw err;
  }
}

export async function getMyPrescriptions(token) {
  const response = await fetch('/api/v2/patient/me/prescriptions', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error('SERVER_ERROR');
  }

  return response.json();
}

export async function getMyPrescription(id, token) {
  const response = await fetch(`/api/v2/patient/me/prescriptions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    if (response.status === 403) throw new Error('FORBIDDEN');
    if (response.status === 404) throw new Error('NOT_FOUND');
    throw new Error('SERVER_ERROR');
  }

  return response.json();
}

export async function getMfaStatus(token) {
  const response = await fetch('/api/v2/auth/mfa/status', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error('SERVER_ERROR');
  }

  return response.json();
}

export async function enrollMfa(token, label) {
  const response = await fetch('/api/v2/auth/mfa/enroll', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ label }),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error('SERVER_ERROR');
  }

  return response.json();
}

export async function disableMfa(token) {
  const response = await fetch('/api/v2/auth/mfa/disable', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error('SERVER_ERROR');
  }

  return response.json();
}
