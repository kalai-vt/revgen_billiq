import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// RegisterForm renders through useAuth() -> useAuthStore() -> authApi.register(). Mock the API
// module the same way authStore.test.ts does so submitting the form never hits the network.
vi.mock('@/features/auth/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  resendVerification: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const authApi = await import('@/features/auth/api');
const { RegisterForm } = await import('./RegisterForm');

function renderForm() {
  return render(
    <MemoryRouter>
      <RegisterForm />
    </MemoryRouter>,
  );
}

async function fillValidFormExceptPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('First name'), 'Ada');
  await user.type(screen.getByLabelText('Last name'), 'Lovelace');
  await user.type(screen.getByLabelText('Company name'), 'Acme Co');
  await user.type(screen.getByLabelText('Legal name'), 'Acme Co Pvt Ltd');
  await user.type(screen.getByPlaceholderText('9876543210'), '9876543210');
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
}

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.mocked(authApi.register).mockReset();
    mockNavigate.mockReset();
  });

  it('shows validation errors for every required field when submitted empty', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /start free trial/i }));

    expect(await screen.findByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Last name is required')).toBeInTheDocument();
    expect(screen.getByText('Company name must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Legal name must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Phone number is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 10 characters long')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('rejects a password that is long enough but missing complexity, with a clear inline error', async () => {
    const user = userEvent.setup();
    renderForm();

    await fillValidFormExceptPassword(user);
    // 10+ chars, but lowercase-only — no uppercase, digit, or special character.
    await user.type(screen.getByLabelText('Password'), 'lowercaseonly');
    await user.click(screen.getByRole('button', { name: /start free trial/i }));

    expect(await screen.findByText('Password must include at least one uppercase letter')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('submits successfully once every field satisfies the schema', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      tenant: {
        id: 'tenant-1',
        company_name: 'Acme Co',
        legal_name: 'Acme Co Pvt Ltd',
        email: 'ada@example.com',
        phone: '+919876543210',
        phone_type: 'mobile',
        country: 'IN',
        timezone: 'Asia/Kolkata',
        language: 'en',
        created_at: '2026-01-01T00:00:00Z',
      },
      user: {
        id: 'user-1',
        tenant_id: 'tenant-1',
        email: 'ada@example.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
        mobile: null,
        role: 'owner',
        status: 'pending',
        is_email_verified: false,
        avatar_url: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    });

    const user = userEvent.setup();
    renderForm();

    await fillValidFormExceptPassword(user);
    await user.type(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
    await user.click(screen.getByRole('button', { name: /start free trial/i }));

    await waitFor(() => expect(authApi.register).toHaveBeenCalledTimes(1));
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({
        company_name: 'Acme Co',
        legal_name: 'Acme Co Pvt Ltd',
        email: 'ada@example.com',
        phone: '+919876543210',
        phone_type: 'mobile',
        password: 'Str0ng!Passw0rd',
        first_name: 'Ada',
        last_name: 'Lovelace',
      }),
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/check-email', { state: { email: 'ada@example.com' } }),
    );
  });
});
