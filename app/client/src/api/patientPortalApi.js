import { updateStoredSessionToken } from '../sessionStorage';

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

export async function refreshAccessToken() {
  try {
    const response = await fetch('/api/v2/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (response.status === 401) {
      throw new Error('SESSION_EXPIRED');
    }

    if (!response.ok) {
      throw new Error('SERVER_ERROR');
    }

    const data = await response.json();
    return data.accessToken;
  } catch (err) {
    if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
      throw new Error('NETWORK_ERROR');
    }
    throw err;
  }
}

function buildAuthHeaders(token, headers = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

function withRefreshedToken(payload, originalToken, activeToken) {
  if (originalToken === activeToken) {
    return payload;
  }

  return {
    ...payload,
    accessToken: activeToken,
  };
}

async function fetchWithTokenRefresh(url, token, options = {}, onTokenRefresh) {
  const performRequest = async (activeToken) =>
    fetch(url, {
      ...options,
      headers: buildAuthHeaders(activeToken, options.headers),
    });

  let activeToken = token;
  let response = await performRequest(activeToken);

  if (response.status !== 401) {
    return { response, token: activeToken };
  }

  activeToken = await refreshAccessToken();
  if (typeof onTokenRefresh === 'function') {
    onTokenRefresh(activeToken);
  } else {
    updateStoredSessionToken(activeToken);
  }

  response = await performRequest(activeToken);
  return { response, token: activeToken };
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
    };
  } catch (err) {
    if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
      throw new Error('NETWORK_ERROR');
    }
    throw err;
  }
}

export async function getMyPrescriptions(token, onTokenRefresh) {
  const { response, token: activeToken } = await fetchWithTokenRefresh(
    '/api/v2/patient/me/prescriptions',
    token,
    {},
    onTokenRefresh,
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error('SERVER_ERROR');
  }

  const data = await response.json();
  return withRefreshedToken(data, token, activeToken);
}

export async function getMyPrescription(id, token, onTokenRefresh) {
  const { response, token: activeToken } = await fetchWithTokenRefresh(
    `/api/v2/patient/me/prescriptions/${id}`,
    token,
    {},
    onTokenRefresh,
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    if (response.status === 403) throw new Error('FORBIDDEN');
    if (response.status === 404) throw new Error('NOT_FOUND');
    throw new Error('SERVER_ERROR');
  }

  const data = await response.json();
  return withRefreshedToken(data, token, activeToken);
}

export async function getMfaStatus(token, onTokenRefresh) {
  const { response, token: activeToken } = await fetchWithTokenRefresh(
    '/api/v2/auth/mfa/status',
    token,
    {},
    onTokenRefresh,
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error('SERVER_ERROR');
  }

  const data = await response.json();
  return withRefreshedToken(data, token, activeToken);
}

export async function enrollMfa(token, label, onTokenRefresh) {
  const { response, token: activeToken } = await fetchWithTokenRefresh(
    '/api/v2/auth/mfa/enroll',
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    },
    onTokenRefresh,
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error('SERVER_ERROR');
  }

  const data = await response.json();
  return withRefreshedToken(data, token, activeToken);
}

export async function disableMfa(token, onTokenRefresh) {
  const { response, token: activeToken } = await fetchWithTokenRefresh(
    '/api/v2/auth/mfa/disable',
    token,
    {
      method: 'POST',
    },
    onTokenRefresh,
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error('SERVER_ERROR');
  }

  const data = await response.json();
  return withRefreshedToken(data, token, activeToken);
}
