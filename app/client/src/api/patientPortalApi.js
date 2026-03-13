import { updateStoredSessionToken } from '../sessionStorage';

/**
 * Authenticate a patient and return either an access token or MFA challenge.
 *
 * @param {string} email - Patient email address.
 * @param {string} password - Patient password.
 * @returns {Promise<object>} Login response payload.
 */
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

/**
 * Rotate the access token using the refresh cookie issued by the server.
 *
 * @returns {Promise<string>} Newly issued access token.
 */
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

/**
 * Build authorization headers for an authenticated API request.
 *
 * @param {string} token - Bearer token to attach.
 * @param {object} [headers={}] - Existing request headers.
 * @returns {object} Merged headers with Authorization applied.
 */
function buildAuthHeaders(token, headers = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Attach a rotated access token to a response payload when one was used.
 *
 * @param {object} payload - Response payload to return to the caller.
 * @param {string} originalToken - Token used for the first request attempt.
 * @param {string} activeToken - Token used for the successful request.
 * @returns {object} Original or augmented payload.
 */
function withRefreshedToken(payload, originalToken, activeToken) {
  if (originalToken === activeToken) {
    return payload;
  }

  return {
    ...payload,
    accessToken: activeToken,
  };
}

/**
 * Retry one authenticated fetch after refreshing the access token on 401.
 *
 * @param {string} url - API path to request.
 * @param {string} token - Current access token.
 * @param {object} [options={}] - Fetch init options.
 * @param {Function} [onTokenRefresh] - Optional callback for persisting a new token.
 * @returns {Promise<{response: Response, token: string}>} Final response and token used.
 */
async function fetchWithTokenRefresh(url, token, options = {}, onTokenRefresh) {
  /**
   * Execute the request with the currently active bearer token.
   *
   * @param {string} activeToken - Access token to send with the request.
   * @returns {Promise<Response>} Fetch response for the requested resource.
   */
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

/**
 * Complete MFA verification and exchange the MFA token for an access token.
 *
 * @param {string} code - Submitted MFA code.
 * @param {string} mfaToken - Short-lived MFA challenge token.
 * @returns {Promise<object>} MFA verification response payload.
 */
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

/**
 * Fetch the authenticated patient's prescription list.
 *
 * @param {string} token - Current access token.
 * @param {Function} [onTokenRefresh] - Optional callback for persisting a rotated token.
 * @returns {Promise<object>} Prescription list payload.
 */
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

/**
 * Fetch a single prescription for the authenticated patient.
 *
 * @param {string} id - Prescription identifier.
 * @param {string} token - Current access token.
 * @param {Function} [onTokenRefresh] - Optional callback for persisting a rotated token.
 * @returns {Promise<object>} Prescription detail payload.
 */
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

/**
 * Retrieve MFA enrollment status for the current patient session.
 *
 * @param {string} token - Current access token.
 * @param {Function} [onTokenRefresh] - Optional callback for persisting a rotated token.
 * @returns {Promise<object>} MFA status payload.
 */
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

/**
 * Start MFA enrollment for the current patient session.
 *
 * @param {string} token - Current access token.
 * @param {string} label - User-provided label for the MFA device.
 * @param {Function} [onTokenRefresh] - Optional callback for persisting a rotated token.
 * @returns {Promise<object>} MFA enrollment payload.
 */
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

/**
 * Disable MFA for the current patient session.
 *
 * @param {string} token - Current access token.
 * @param {Function} [onTokenRefresh] - Optional callback for persisting a rotated token.
 * @returns {Promise<object>} MFA disable response payload.
 */
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
