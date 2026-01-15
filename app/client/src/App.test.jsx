import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './test-utils';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as api from './api/prescriptionApi';

// Mock the API module
vi.mock('./api/prescriptionApi');

const mockPrescription = {
  id: 'demo-id',
  clinicName: 'Test Clinic',
  date: '2023-01-01',
  doctor: { name: 'Dr. House', license: '123', phone: '555-5555', email: 'doc@test.com' },
  patient: { name: 'Jane Doe', gender: 'Female', dob: '1990-01-01', phone: '555-1234', email: 'jane@test.com' },
  medications: [{ name: 'Aspirin', dosage: '100mg', directions: 'Once a day', quantity: '30' }]
};

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows login screen initially', () => {
    render(<App />);
    expect(screen.getByText(/secure login/i)).toBeInTheDocument();
  });

  it('loads prescription after successful login', async () => {
    const user = userEvent.setup();

    api.login.mockResolvedValue('fake-jwt-token');
    api.getPrescription.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms Delay
      return mockPrescription;
    });

    render(<App />);

    // Perform Login
    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'pass');
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    expect(await screen.findByText(/decrypting/i)).toBeInTheDocument();

    // Verify Data Rendered
    await waitFor(() => {
      expect(screen.getByText('Test Clinic')).toBeInTheDocument();
      expect(screen.getByText('Dr. House')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue('fake-jwt-token');
    
    api.getPrescription.mockRejectedValue(new Error('Server Error'));

    render(<App />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'pass');
    await user.click(screen.getByRole('button', { name: /secure login/i }));

    // Wait for the error banner
    await waitFor(() => {
      expect(screen.getByText(/could not load patient record/i)).toBeInTheDocument();
    });
  });
});