import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test-utils';
import userEvent from '@testing-library/user-event';
import PatientPortal from './PatientPortal';

const buildFixtureEmail = () => `patient-${Math.random().toString(36).slice(2, 10)}@test.invalid`;
const buildFixtureMfaSecret = () => `MFA-${Math.random().toString(36).toUpperCase().slice(2, 14)}`;

const baseProps = {
  user: { email: buildFixtureEmail() },
  prescriptions: [
    {
      id: 'rx-1',
      status: 'active',
      issuedAt: '2024-01-02T10:00:00.000Z',
      doctor: { name: 'Dr. Alice Doe' },
    },
  ],
  selectedId: 'rx-1',
  prescriptionDetail: {
    id: 'rx-1',
    status: 'active',
    issuedAt: '2024-01-02T10:00:00.000Z',
    expiresAt: '2024-02-02T10:00:00.000Z',
    doctor: { name: 'Dr. Alice Doe' },
    notes: 'Take with water',
    items: [
      {
        id: 'item-1',
        name: 'Amoxicillin',
        strength: '500mg',
        dose: '1 capsule',
        instructions: 'After meals',
        frequency: 'TID',
        duration: '7 days',
      },
    ],
  },
  onSelect: vi.fn(),
  onLogout: vi.fn(),
  loadingList: false,
  loadingDetail: false,
  portalError: null,
  mfaStatus: { configured: false, enabled: false },
  mfaEnrollData: null,
  mfaEnrollLoading: false,
  mfaEnrollError: null,
  onEnrollMfa: vi.fn(),
  mfaVerifyLoading: false,
  mfaVerifyError: null,
  onVerifyMfaNow: vi.fn(),
  mfaBanner: null,
  onDisableMfa: vi.fn(),
};

describe('PatientPortal', () => {
  it('renders prescription list and details', () => {
    render(<PatientPortal {...baseProps} />);

    expect(screen.getByText(/my prescriptions/i)).toBeInTheDocument();
    expect(screen.getAllByText(/dr\. alice doe/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/amoxicillin/i)).toBeInTheDocument();
  });

  it('invokes selection and logout actions', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onLogout = vi.fn();

    render(<PatientPortal {...baseProps} onSelect={onSelect} onLogout={onLogout} />);

    await user.click(screen.getAllByRole('button', { name: /dr\. alice doe/i })[0]);
    expect(onSelect).toHaveBeenCalledWith('rx-1');

    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows MFA enroll UI and invokes enrollment action when MFA is not configured', async () => {
    const user = userEvent.setup();
    const onEnrollMfa = vi.fn();

    render(
      <PatientPortal
        {...baseProps}
        mfaStatus={{ configured: false, enabled: false }}
        onEnrollMfa={onEnrollMfa}
      />,
    );

    expect(screen.getByRole('button', { name: /enable mfa/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /enable mfa/i }));
    expect(onEnrollMfa).toHaveBeenCalled();
  });

  it('shows pending MFA verification UI and submits the verification code', async () => {
    const user = userEvent.setup();
    const onVerifyMfaNow = vi.fn();

    render(
      <PatientPortal
        {...baseProps}
        mfaStatus={{ configured: true, enabled: false }}
        mfaEnrollData={{ qrCodeDataUrl: 'data:image/png;base64,abc', secret: buildFixtureMfaSecret() }}
        onVerifyMfaNow={onVerifyMfaNow}
      />,
    );

    expect(screen.getByAltText(/mfa qr code/i)).toBeInTheDocument();
    expect(screen.getByText(/^MFA-/)).toBeInTheDocument();
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify now/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/verification code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify now/i }));

    expect(onVerifyMfaNow).toHaveBeenCalledWith('123456');
  });

  it('shows disable MFA action when MFA is enabled', async () => {
    const user = userEvent.setup();
    const onDisableMfa = vi.fn();

    render(
      <PatientPortal
        {...baseProps}
        mfaStatus={{ configured: true, enabled: true }}
        mfaEnrollData={null}
        onDisableMfa={onDisableMfa}
      />,
    );

    await user.click(screen.getByRole('button', { name: /disable mfa/i }));
    expect(onDisableMfa).toHaveBeenCalled();
  });

  it('renders loading and empty states', () => {
    const { rerender } = render(<PatientPortal {...baseProps} loadingList={true} />);
    expect(screen.getByText(/loading prescriptions/i)).toBeInTheDocument();

    rerender(<PatientPortal {...baseProps} loadingList={false} prescriptions={[]} selectedId={null} />);
    expect(screen.getByText(/no prescriptions yet/i)).toBeInTheDocument();
  });
});
