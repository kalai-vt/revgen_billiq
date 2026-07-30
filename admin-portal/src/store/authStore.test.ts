import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAuthResult, AdminUser } from '@/services/authApi';

// The store bootstraps itself at module load time by checking localStorage for an access
// token (see the bottom of authStore.ts) and, if present, calls authApi.me(). Mock the whole
// api module up front so that bootstrap — and every action under test — never hits the network.
vi.mock('@/services/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
}));

const authApi = await import('@/services/authApi');
const { useAdminAuthStore } = await import('./authStore');

const adminUser: AdminUser = {
  id: 'admin-1',
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@revgeniq.com',
  role: 'super_admin',
  status: 'active',
  last_login: null,
  created_at: '2026-01-01T00:00:00Z',
};

const initialState = useAdminAuthStore.getState();

describe('useAdminAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAdminAuthStore.setState(initialState, true);
    vi.mocked(authApi.login).mockReset();
    vi.mocked(authApi.logout).mockReset();
    vi.mocked(authApi.me).mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts signed out', () => {
    const state = useAdminAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.adminUser).toBeNull();
  });

  it('login() stores tokens and marks the session authenticated', async () => {
    const result: AdminAuthResult = {
      access_token: 'access-abc',
      refresh_token: 'refresh-def',
      admin_user: adminUser,
    };
    vi.mocked(authApi.login).mockResolvedValue(result);

    await useAdminAuthStore.getState().login('grace@revgeniq.com', 'hunter2');

    expect(authApi.login).toHaveBeenCalledWith('grace@revgeniq.com', 'hunter2');
    const state = useAdminAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.adminUser).toEqual(adminUser);
    expect(localStorage.getItem('revgeniq_admin_access_token')).toBe('access-abc');
    expect(localStorage.getItem('revgeniq_admin_refresh_token')).toBe('refresh-def');
  });

  it('logout() clears tokens and resets the session back to signed out', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'access-abc',
      refresh_token: 'refresh-def',
      admin_user: adminUser,
    });
    await useAdminAuthStore.getState().login('grace@revgeniq.com', 'hunter2');
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(true);

    vi.mocked(authApi.logout).mockResolvedValue(undefined);

    await useAdminAuthStore.getState().logout();

    expect(authApi.logout).toHaveBeenCalledWith('refresh-def');
    const state = useAdminAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.adminUser).toBeNull();
    expect(localStorage.getItem('revgeniq_admin_access_token')).toBeNull();
    expect(localStorage.getItem('revgeniq_admin_refresh_token')).toBeNull();
  });

  it('logout() still clears local session state even if the server call fails', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'access-abc',
      refresh_token: 'refresh-def',
      admin_user: adminUser,
    });
    await useAdminAuthStore.getState().login('grace@revgeniq.com', 'hunter2');

    vi.mocked(authApi.logout).mockRejectedValue(new Error('network down'));

    await useAdminAuthStore.getState().logout();

    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('revgeniq_admin_access_token')).toBeNull();
  });

  it('setAdminUser() updates the store directly', () => {
    useAdminAuthStore.getState().setAdminUser(adminUser);
    expect(useAdminAuthStore.getState().adminUser).toEqual(adminUser);
  });
});
