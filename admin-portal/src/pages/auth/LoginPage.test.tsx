import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// LoginPage renders through useAdminAuth() -> useAdminAuthStore() -> authApi.login(). Mock the
// API module the same way authStore.test.ts does so submitting the form never hits the network.
vi.mock('@/services/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const authApi = await import('@/services/authApi');
const { LoginPage } = await import('./LoginPage');

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(authApi.login).mockReset();
    mockNavigate.mockReset();
  });

  it('shows validation errors when submitted empty, without calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('flags an invalid email format before hitting the network', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('submits and navigates home once email and password are both present and well-formed', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      admin_user: {
        id: 'admin-1',
        first_name: 'Grace',
        last_name: 'Hopper',
        email: 'grace@revgeniq.com',
        role: 'super_admin',
        status: 'active',
        last_login: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    });

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'grace@revgeniq.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith('grace@revgeniq.com', 'hunter2'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });
});
