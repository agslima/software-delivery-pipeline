import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../test-utils';
import userEvent from '@testing-library/user-event';
import PatientLogin from './PatientLogin';

describe('PatientLogin Component', () => {
  it('submits email/password to onLogin', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);

    render(<PatientLogin onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/email/i), 'patient@test.invalid');
    await user.type(screen.getByLabelText(/password/i), 'Secret123!');
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('patient@test.invalid', 'Secret123!');
    });
  });

  it('shows incorrect-credentials error message', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockRejectedValue(new Error('INCORRECT_CREDENTIALS'));

    render(<PatientLogin onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/email/i), 'bad@test.invalid');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByText(/incorrect email or password/i)).toBeInTheDocument();
  });

  it('shows generic error for unexpected login failures', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockRejectedValue(new Error('SERVER_ERROR'));

    render(<PatientLogin onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/email/i), 'user@test.invalid');
    await user.type(screen.getByLabelText(/password/i), 'pass');
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('renders MFA form, verifies code, and allows cancel', async () => {
    const user = userEvent.setup();
    const onVerifyMfa = vi.fn().mockResolvedValue(undefined);
    const onCancelMfa = vi.fn();

    render(
      <PatientLogin
        onLogin={vi.fn()}
        onVerifyMfa={onVerifyMfa}
        onCancelMfa={onCancelMfa}
        mfaChallenge={{ mfaToken: 'token-1', user: { id: 'u1' } }}
      />
    );

    await user.type(screen.getByLabelText(/verification code/i), '654321');
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => {
      expect(onVerifyMfa).toHaveBeenCalledWith('654321');
    });

    await user.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(onCancelMfa).toHaveBeenCalled();
  });

  it('shows invalid MFA code message on verification failure', async () => {
    const user = userEvent.setup();
    const onVerifyMfa = vi.fn().mockRejectedValue(new Error('INVALID_MFA_CODE'));

    render(
      <PatientLogin
        onLogin={vi.fn()}
        onVerifyMfa={onVerifyMfa}
        onCancelMfa={vi.fn()}
        mfaChallenge={{ mfaToken: 'token-1', user: { id: 'u1' } }}
      />
    );

    await user.type(screen.getByLabelText(/verification code/i), '000000');
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    expect(await screen.findByText(/invalid verification code/i)).toBeInTheDocument();
  });
});
