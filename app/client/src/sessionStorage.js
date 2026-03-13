export const SESSION_STORAGE_KEY =
  import.meta.env.VITE_PATIENT_PORTAL_SESSION_STORAGE_KEY || 'patient_portal_session';

export function readStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStoredSession(session) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

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
