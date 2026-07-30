import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResult, RegisterResult, Tenant, User } from '@/features/auth/api';

// The store bootstraps itself at module load time by checking localStorage for an access
// token (see the bottom of authStore.ts) and, if present, calls authApi.me(). Mock the whole
// api module up front so that bootstrap — and every action under test — never hits the network.
vi.mock('@/features/auth/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
}));

const authApi = await import('@/features/auth/api');
const { useAuthStore } = await import('./authStore');

const user: User = {
  id: 'user-1',
  tenant_id: 'tenant-1',
  email: 'owner@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  mobile: null,
  role: 'owner',
  status: 'active',
  is_email_verified: true,
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
};

const tenant: Tenant = {
  id: 'tenant-1',
  company_name: 'Acme Co',
  legal_name: 'Acme Co Pvt Ltd',
  email: 'billing@example.com',
  phone: '+91 90000 00000',
  phone_type: 'mobile',
  country: 'IN',
  timezone: 'Asia/Kolkata',
  language: 'en',
  created_at: '2026-01-01T00:00:00Z',
};

const initialState = useAuthStore.getState();

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(initialState, true);
    vi.mocked(authApi.login).mockReset();
    vi.mocked(authApi.register).mockReset();
    vi.mocked(authApi.logout).mockReset();
    vi.mocked(authApi.me).mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts signed out', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.tenant).toBeNull();
  });

  it('login() stores tokens and marks the session authenticated', async () => {
    const result: AuthResult = {
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      user,
      tenant,
      plan: 'advance',
      can_override_price: true,
    };
    vi.mocked(authApi.login).mockResolvedValue(result);

    await useAuthStore.getState().login('owner@example.com', 'hunter2');

    const state = useAuthStore.getState();
    expect(authApi.login).toHaveBeenCalledWith('owner@example.com', 'hunter2', false);
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(user);
    expect(state.tenant).toEqual(tenant);
    expect(state.plan).toBe('advance');
    expect(state.canOverridePrice).toBe(true);
    expect(localStorage.getItem('revgeniq_access_token')).toBe('access-123');
    expect(localStorage.getItem('revgeniq_refresh_token')).toBe('refresh-456');
  });

  it('login() without a tenant on the response falls back to fetching /me', async () => {
    const result: AuthResult = {
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      user,
    };
    vi.mocked(authApi.login).mockResolvedValue(result);
    vi.mocked(authApi.me).mockResolvedValue({ user, tenant, plan: 'basic', can_override_price: false });

    await useAuthStore.getState().login('owner@example.com', 'hunter2');

    expect(authApi.me).toHaveBeenCalledTimes(1);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.tenant).toEqual(tenant);
    expect(state.plan).toBe('basic');
  });

  it('logout() clears tokens and resets the session back to signed out', async () => {
    // Arrange an authenticated session first.
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      user,
      tenant,
      plan: 'advance',
      can_override_price: true,
    });
    await useAuthStore.getState().login('owner@example.com', 'hunter2');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    vi.mocked(authApi.logout).mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(authApi.logout).toHaveBeenCalledWith('refresh-456');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.tenant).toBeNull();
    expect(state.plan).toBeNull();
    expect(state.canOverridePrice).toBe(false);
    expect(localStorage.getItem('revgeniq_access_token')).toBeNull();
    expect(localStorage.getItem('revgeniq_refresh_token')).toBeNull();
  });

  it('logout() still clears local session state even if the server call fails', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      user,
      tenant,
    });
    await useAuthStore.getState().login('owner@example.com', 'hunter2');

    vi.mocked(authApi.logout).mockRejectedValue(new Error('network down'));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('revgeniq_access_token')).toBeNull();
  });

  it('register() delegates straight to the API without touching session state', async () => {
    const registerResult: RegisterResult = { tenant, user };
    vi.mocked(authApi.register).mockResolvedValue(registerResult);

    const payload = {
      company_name: 'Acme Co',
      legal_name: 'Acme Co Pvt Ltd',
      email: 'owner@example.com',
      phone: '+91 90000 00000',
      phone_type: 'mobile' as const,
      password: 'hunter2',
      first_name: 'Ada',
      last_name: 'Lovelace',
    };

    const result = await useAuthStore.getState().register(payload);

    expect(authApi.register).toHaveBeenCalledWith(payload);
    expect(result).toEqual(registerResult);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('setTenant()/setPlan()/setUser() update the store directly', () => {
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setTenant(tenant);
    useAuthStore.getState().setPlan('explore');

    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.tenant).toEqual(tenant);
    expect(state.plan).toBe('explore');
  });
});
