/**
 * Canonical browser storage key for patient portal session state.
 *
 * @type {string}
 */
export const SESSION_STORAGE_KEY =
  import.meta.env.VITE_PATIENT_PORTAL_SESSION_STORAGE_KEY || 'patient_portal_session';

/**
 * Read and deserialize the stored patient session.
 *
 * @returns {object|null} Parsed session data, or `null` when missing or invalid.
 */
export function readStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persist the current patient session payload.
 *
 * @param {object} session - Session data to serialize into sessionStorage.
 */
export function writeStoredSession(session) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

/**
 * Remove any stored patient session state.
 */
export function clearStoredSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Replace the access token within an existing stored session.
 *
 * @param {string} token - Fresh access token to persist.
 * @returns {object|null} Updated session payload, or `null` when no session exists.
 */
export function updateStoredSessionToken(token) {
  const currentSession = readStoredSession();
  if (!currentSession) {
    return null;
  }

  const nextSession = {
    ...currentSession,
    token,
  };
  writeStoredSession(nextSession);
  return nextSession;
}
