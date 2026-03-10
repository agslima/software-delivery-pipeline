import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loginPatient,
  verifyMfa,
  getMyPrescriptions,
  getMyPrescription,
  getMfaStatus,
  enrollMfa,
  disableMfa,
} from './patientPortalApi';

describe('patientPortalApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('loginPatient returns token payload on success', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ accessToken: 'jwt-1', user: { id: 'p-1' } }),
    });

    await expect(loginPatient('patient@example.test', 'Password123!')).resolves.toEqual({
      token: 'jwt-1',
      user: { id: 'p-1' },
    });
  });

  it('loginPatient returns MFA challenge and maps failures', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ mfaRequired: true, mfaToken: 'mfa-1', user: { id: 'p-1' } }),
    });
    await expect(loginPatient('patient@example.test', 'Password123!')).resolves.toEqual({
      mfaRequired: true,
      mfaToken: 'mfa-1',
      user: { id: 'p-1' },
    });

    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(loginPatient('patient@example.test', 'bad-pass')).rejects.toMatchObject({
      message: 'INCORRECT_CREDENTIALS',
    });

    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(loginPatient('patient@example.test', 'bad-pass')).rejects.toMatchObject({
      message: 'SERVER_ERROR',
    });

    fetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(loginPatient('patient@example.test', 'bad-pass')).rejects.toMatchObject({
      message: 'NETWORK_ERROR',
    });
  });

  it('verifyMfa returns token payload and maps 400/network errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ accessToken: 'jwt-2', refreshToken: 'r-1' }),
    });

    await expect(verifyMfa('123456', 'mfa-token')).resolves.toEqual({
      token: 'jwt-2',
      refreshToken: 'r-1',
    });

    fetch.mockResolvedValueOnce({ ok: false, status: 400 });
    await expect(verifyMfa('000000', 'mfa-token')).rejects.toMatchObject({ message: 'INVALID_MFA_CODE' });

    fetch.mockRejectedValueOnce(new Error('NetworkError when attempting to fetch resource'));
    await expect(verifyMfa('000000', 'mfa-token')).rejects.toMatchObject({ message: 'NETWORK_ERROR' });
  });

  it('maps status codes for list/detail endpoints', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ prescriptions: [] }) });
    await expect(getMyPrescriptions('jwt')).resolves.toEqual({ prescriptions: [] });

    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(getMyPrescriptions('jwt')).rejects.toMatchObject({ message: 'SESSION_EXPIRED' });

    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(getMyPrescriptions('jwt')).rejects.toMatchObject({ message: 'SERVER_ERROR' });

    fetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(getMyPrescription('rx-1', 'jwt')).rejects.toMatchObject({ message: 'FORBIDDEN' });

    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(getMyPrescription('rx-1', 'jwt')).rejects.toMatchObject({ message: 'NOT_FOUND' });
  });

  it('maps MFA status/enroll/disable success and auth failures', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ enabled: true }) });
    await expect(getMfaStatus('jwt')).resolves.toEqual({ enabled: true });

    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(getMfaStatus('jwt')).rejects.toMatchObject({ message: 'SESSION_EXPIRED' });

    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ secret: 'ABC' }) });
    await expect(enrollMfa('jwt', 'phone')).resolves.toEqual({ secret: 'ABC' });

    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(enrollMfa('jwt', 'phone')).rejects.toMatchObject({ message: 'SESSION_EXPIRED' });

    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ ok: true }) });
    await expect(disableMfa('jwt')).resolves.toEqual({ ok: true });

    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(disableMfa('jwt')).rejects.toMatchObject({ message: 'SERVER_ERROR' });
  });
});
