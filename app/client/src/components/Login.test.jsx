import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../test-utils';
import userEvent from '@testing-library/user-event'; 
import Login from './Login';

describe('Login Component', () => {
  it('renders login form correctly', () => {
    render(<Login onLogin={vi.fn()} />);
    
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /secure login/i })).toBeInTheDocument();
  });

  it('allows typing into input fields', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={vi.fn()} />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(usernameInput, 'admin');
    await user.type(passwordInput, 'secret');

    expect(usernameInput).toHaveValue('admin');
    expect(passwordInput).toHaveValue('secret');
  });

  it('displays loading spinner when submitting', async () => {
    const user = userEvent.setup(); 
    const mockLogin = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
    render(<Login onLogin={mockLogin} />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'secret');

    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(screen.getByRole('button')).toContainHTML('spinner');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows error message on failure', async () => {
    const user = userEvent.setup(); 
    const mockLogin = vi.fn(() => Promise.reject(new Error('INCORRECT_CREDENTIALS')));
    render(<Login onLogin={mockLogin} />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'secret');

    await user.click(screen.getByRole('button', { name: /secure login/i }));

    await waitFor(() => {
      expect(screen.getByText(/incorrect username or password/i)).toBeInTheDocument();
    });
  });
});