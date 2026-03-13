import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './test-utils';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as api from './api/patientPortalApi';

vi.mock('./api/patientPortalApi');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const buildTestEmail = (label = 'patient') => `${label}-${Math.random().toString(36).slice(2)}@test.invalid`;
const buildTestPassword = (label = 'pwd') => `${label}-${Math.random().toString(36).slice(2)}!`;
const buildToken = (label = 'token') => `${label}-${Math.random().toString(36).slice(2)}`;
const buildBase32Secret = (length = 32) => {
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += BASE32_ALPHABET[Math.floor(Math.random() * BASE32_ALPHABET.length)];
  }
  return output;
};

const mockSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  issuedAt: '2023-07-10T10:00:00Z',
  doctor: { id: 'doctor-1', name: 'Dr. Emily Johnson' },
};

const mockDetail = {
  id: mockSummary.id,
  status: 'active',
  issuedAt: '2023-07-10T10:00:00Z',
  expiresAt: '2023-08-10T10:00:00Z',
  notes: 'Follow up in 2 weeks',
  doctor: { id: 'doctor-1', name: 'Dr. Emily Johnson' },
  patient: { id: 'patient-1', name: 'John Smith' },
  items: [
    {
      id: 'item-1',
      medicationId: 'med-1',
      name: 'Amoxicillin',
      form: 'capsule',
      strength: '500mg',
      dose: '500mg',
      frequency: 'TID',
      duration: '10 days',
      quantity: '30 capsules',
      instructions: 'Take with meals.',
    },
  ],
  interactionWarnings: [],
};

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    api.getMfaStatus.mockResolvedValue({ configured: false, enabled: false });
    api.getMyPrescriptions.mockResolvedValue({ prescriptions: [] });
    api.getMyPrescription.mockResolvedValue(mockDetail);
    api.verifyMfa.mockResolvedValue({ token: 'token-default' });
    api.disableMfa.mockResolvedValue({ ok: true });
    const mfaSecret = buildBase32Secret();
    api.enrollMfa.mockResolvedValue({
      secret: mfaSecret,
      otpauthUrl: `otpauth://totp/StayHealthy?secret=${mfaSecret}`,
      qrCodeDataUrl: 'data:image/png;base64,qr',
    });
  });

  it('shows login screen initially', () => {
    render(<App />);
    expect(screen.getByText(/patient prescription portal/i)).toBeInTheDocument();
  });

  it('loads prescriptions after successful login', async () => {
    const user = userEvent.setup();
    const email = buildTestEmail();
    const password = buildTestPassword();
    const token = buildToken('jwt');

    api.loginPatient.mockResolvedValue({
      token,
      user: { id: 'patient-1', email, role: 'patient', mfaEnabled: false },
    });
    api.getMyPrescriptions.mockResolvedValue({ prescriptions: [mockSummary] });
    api.getMyPrescription.mockResolvedValue(mockDetail);

    render(<App />);

    await user.type(screen.getByLabelText(/email/i), email);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByText(/prescription history/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Emily Johnson').length).toBeGreaterThan(0);
    });
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();
    const email = buildTestEmail();
    const password = buildTestPassword();
    const token = buildToken('jwt');
    api.loginPatient.mockResolvedValue({
      token,
      user: { id: 'patient-1', email, role: 'patient', mfaEnabled: false },
    });

    render(<App />);

    api.getMyPrescriptions.mockRejectedValue(new Error('SERVER_ERROR'));

    await user.type(screen.getByLabelText(/email/i), email);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    await waitFor(() => {
      expect(screen.getByText(/unable to load prescriptions/i)).toBeInTheDocument();
    });
  });

  it('handles MFA-required login and completes MFA verification', async () => {
    const user = userEvent.setup();
    const email = buildTestEmail('mfa');
    const password = buildTestPassword();

    api.loginPatient.mockResolvedValue({
      mfaRequired: true,
      mfaToken: 'mfa-token-1',
      user: { id: 'patient-2', email, role: 'patient', mfaEnabled: true },
    });
    api.verifyMfa.mockResolvedValue({ token: 'token-after-mfa' });
    api.getMyPrescriptions.mockResolvedValue({ prescriptions: [mockSummary] });
    api.getMyPrescription.mockResolvedValue(mockDetail);

    render(<App />);

    await user.type(screen.getByLabelText(/email/i), email);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByText(/two-factor verification/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/verification code/i), '123456');
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => {
      expect(api.verifyMfa).toHaveBeenCalledWith('123456', 'mfa-token-1');
    });
    await waitFor(() => {
      expect(api.getMyPrescriptions).toHaveBeenCalledWith('token-after-mfa');
      expect(sessionStorage.getItem('patient_portal_session')).toEqual(
        JSON.stringify({
          token: 'token-after-mfa',
          user: { id: 'patient-2', email, role: 'patient', mfaEnabled: true },
        })
      );
    });
    expect(await screen.findByText(/prescription history/i)).toBeInTheDocument();
  });

  it('returns to login when prescriptions call reports SESSION_EXPIRED', async () => {
    const user = userEvent.setup();
    const email = buildTestEmail('expired');
    const password = buildTestPassword();
    const token = 'expired-token';
    let rejectPrescriptions;
    const prescriptionsRequest = new Promise((_, reject) => {
      rejectPrescriptions = reject;
    });

    api.loginPatient.mockResolvedValue({
      token,
      user: { id: 'patient-3', email, role: 'patient', mfaEnabled: false },
    });
    api.getMyPrescriptions.mockReturnValue(prescriptionsRequest);

    render(<App />);

    await user.type(screen.getByLabelText(/email/i), email);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    await waitFor(() => {
      expect(api.loginPatient).toHaveBeenCalledWith(email, password);
      expect(api.getMyPrescriptions).toHaveBeenCalledWith(token);
      expect(sessionStorage.getItem('patient_portal_session')).toEqual(
        JSON.stringify({
          token,
          user: { id: 'patient-3', email, role: 'patient', mfaEnabled: false },
        })
      );
    });

    rejectPrescriptions(new Error('SESSION_EXPIRED'));

    await waitFor(() => {
      expect(sessionStorage.getItem('patient_portal_session')).toBeNull();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /secure login/i })).toBeInTheDocument();
    });
  });

  it('shows access-only view for non-patient users and supports logout', async () => {
    const user = userEvent.setup();
    const email = buildTestEmail('admin');
    const password = buildTestPassword('admin');

    api.loginPatient.mockResolvedValue({
      token: 'admin-token',
      user: { id: 'admin-1', email, role: 'admin', mfaEnabled: false },
    });

    render(<App />);

    await user.type(screen.getByLabelText(/email/i), email);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByRole('heading', { name: /patient portal access only/i })).toBeInTheDocument();
    expect(api.getMyPrescriptions).not.toHaveBeenCalled();
    expect(api.getMyPrescription).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByText(/patient prescription portal/i)).toBeInTheDocument();
  });

  it('handles NOT_FOUND prescription details with a targeted message', async () => {
    const user = userEvent.setup();
    const email = buildTestEmail('not-found');
    const password = buildTestPassword('not-found');

    api.loginPatient.mockResolvedValue({
      token: 'token-not-found',
      user: { id: 'patient-4', email, role: 'patient', mfaEnabled: false },
    });
    api.getMyPrescriptions.mockResolvedValue({ prescriptions: [mockSummary] });
    api.getMyPrescription.mockRejectedValue(new Error('NOT_FOUND'));

    render(<App />);

    await user.type(screen.getByLabelText(/email/i), email);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByText(/prescription not found/i)).toBeInTheDocument();
  });

  it('supports MFA enrollment, verification, and disable paths', async () => {
    const user = userEvent.setup();
    const email = buildTestEmail('mfa-manage');
    const password = buildTestPassword('mfa-manage');

    api.loginPatient.mockResolvedValue({
      token: 'token-mfa-manage',
      user: { id: 'patient-5', email, role: 'patient', mfaEnabled: false },
    });
    api.getMfaStatus
      .mockResolvedValueOnce({ configured: false, enabled: false })
      .mockResolvedValue({ configured: true, enabled: true });
    api.getMyPrescriptions.mockResolvedValue({ prescriptions: [mockSummary] });
    api.getMyPrescription.mockResolvedValue(mockDetail);
    api.verifyMfa.mockResolvedValue({ token: 'token-after-enable' });
    api.disableMfa.mockResolvedValue({ ok: true });

    render(<App />);

    await user.type(screen.getByLabelText(/email/i), email);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByText(/prescription history/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /enable mfa/i }));
    expect(await screen.findByAltText(/mfa qr code/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/verification code/i), '654321');
    await user.click(screen.getByRole('button', { name: /verify now/i }));

    await waitFor(() => {
      expect(api.verifyMfa).toHaveBeenCalledWith('654321', 'token-mfa-manage');
    });
    expect(await screen.findByText(/multi-factor authentication enabled/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(sessionStorage.getItem('patient_portal_session')).toEqual(
        JSON.stringify({
          token: 'token-after-enable',
          user: { id: 'patient-5', email, role: 'patient', mfaEnabled: false },
        })
      );
    });

    await user.click(screen.getByRole('button', { name: /disable mfa/i }));
    await waitFor(() => {
      expect(api.disableMfa).toHaveBeenCalledWith('token-after-enable');
    });
    expect(await screen.findByText(/multi-factor authentication disabled/i)).toBeInTheDocument();
  });
});
