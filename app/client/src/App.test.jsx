import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './test-utils';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as api from './api/patientPortalApi';

// Mock the API module
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

    // Perform Login
    await user.type(screen.getByLabelText(/email/i), email);
    await user.type(screen.getByLabelText(/password/i), password);
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByText(/prescription history/i)).toBeInTheDocument();

    // Verify Data Rendered
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

    // Wait for the error banner
    await waitFor(() => {
      expect(screen.getByText(/unable to load prescriptions/i)).toBeInTheDocument();
    });
  });
});
