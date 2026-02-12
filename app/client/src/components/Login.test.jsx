import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../test-utils';
import userEvent from '@testing-library/user-event'; 
import Login from './Login';

const buildTestUser = (label = 'user') => `${label}-${Math.random().toString(36).slice(2)}`;
const buildTestPassword = (label = 'pwd') => `${label}-${Math.random().toString(36).slice(2)}!`;

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
    const username = buildTestUser('admin');
    const password = buildTestPassword();

    await user.type(usernameInput, username);
    await user.type(passwordInput, password);

    expect(usernameInput).toHaveValue(username);
    expect(passwordInput).toHaveValue(password);
  });

  it('displays loading spinner when submitting', async () => {
    const user = userEvent.setup(); 
    const mockLogin = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
    render(<Login onLogin={mockLogin} />);
    const username = buildTestUser('admin');
    const password = buildTestPassword();

    await user.type(screen.getByLabelText(/username/i), username);
    await user.type(screen.getByLabelText(/password/i), password);

    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(screen.getByRole('button')).toContainHTML('spinner');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows error message on failure', async () => {
    const user = userEvent.setup(); 
    const mockLogin = vi.fn(() => Promise.reject(new Error('INCORRECT_CREDENTIALS')));
    render(<Login onLogin={mockLogin} />);
    const username = buildTestUser('admin');
    const password = buildTestPassword();

    await user.type(screen.getByLabelText(/username/i), username);
    await user.type(screen.getByLabelText(/password/i), password);

    await user.click(screen.getByRole('button', { name: /secure login/i }));

    await waitFor(() => {
      expect(screen.getByText(/incorrect username or password/i)).toBeInTheDocument();
    });
  });
});
