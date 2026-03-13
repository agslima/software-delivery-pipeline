/**
 * Detects whether an error represents a network transport failure.
 *
 * Inspects the error's message, cause.message, and cause.code for common network-failure indicators.
 * @param {unknown} err - The error or value to analyze for network transport failure patterns.
 * @returns {boolean} `true` if the error appears to be a network transport error (matching common fetch/load messages or known network error codes), `false` otherwise.
 */
function isNetworkTransportError(err) {
  const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  const causeMessage =
    typeof err?.cause?.message === 'string' ? err.cause.message.toLowerCase() : '';

  const combinedMessage = `${message} ${causeMessage}`;

  if (
    /failed to fetch|fetch failed|networkerror|network request failed|load failed/.test(
      combinedMessage
    )
  ) {
    return true;
  }

  const causeCode = typeof err?.cause?.code === 'string' ? err.cause.code : '';
  if (/^(econnrefused|econnreset|enotfound|eai_again|etimedout)$/i.test(causeCode)) {
    return true;
  }

  return err instanceof TypeError && combinedMessage.includes('fetch');
}

/**
 * Authenticate with the server using username and password and return an authentication token.
 *
 * @param {string} username - The user's username.
 * @param {string} password - The user's password.
 * @returns {string} The authentication token from the server response.
 * @throws {Error} 'INCORRECT_CREDENTIALS' if the credentials are invalid (HTTP 401).
 * @throws {Error} 'SERVER_ERROR' if the server responds with an error status other than 401.
 * @throws {Error} 'NETWORK_ERROR' if a network transport failure is detected.
 * @throws {Error} Rethrows other unexpected errors encountered during the request.
 */
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
    if (isNetworkTransportError(err)) {
      throw new Error('NETWORK_ERROR');
    }
    throw err;
  }
}

/**
 * Fetches a prescription by ID using the provided bearer token.
 *
 * @param {string|number} id - Prescription identifier to fetch.
 * @param {string} token - Bearer token used for the Authorization header.
 * @returns {any} The parsed JSON prescription object from the response body.
 * @throws {Error} Throws `Error('SESSION_EXPIRED')` when the server responds with 401.
 * @throws {Error} Throws `Error('SERVER_ERROR')` for any other non-successful response status.
 */
export async function getPrescription(id, token) {
  const response = await fetch(`/api/v1/prescriptions/${encodeURIComponent(String(id))}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
     if (response.status === 401) throw new Error('SESSION_EXPIRED');
     throw new Error('SERVER_ERROR');
  }
  return response.json();
}
