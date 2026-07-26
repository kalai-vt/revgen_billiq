import { create } from 'zustand';
import * as authApi from '@/services/authApi';
import { clearTokens, getAccessToken, getRefreshToken, storeTokens } from '@/lib/api-client';
import type { AdminAuthResult, AdminUser } from '@/services/authApi';

interface AdminAuthState {
  adminUser: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAdminUser: (adminUser: AdminUser) => void;
}

function applyAuthResult(set: (partial: Partial<AdminAuthState>) => void, result: AdminAuthResult): void {
  storeTokens(result.access_token, result.refresh_token);
  set({ adminUser: result.admin_user, isAuthenticated: true });
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  adminUser: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const result = await authApi.login(email, password);
    applyAuthResult(set, result);
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => undefined);
    }
    clearTokens();
    set({ adminUser: null, isAuthenticated: false });
  },

  setAdminUser: (adminUser) => set({ adminUser }),
}));

// Bootstrap the session once at module load — mirrors the Billing app's authStore pattern.
if (getAccessToken()) {
  authApi
    .me()
    .then((adminUser) => useAdminAuthStore.setState({ adminUser, isAuthenticated: true, isLoading: false }))
    .catch(() => {
      clearTokens();
      useAdminAuthStore.setState({ isLoading: false });
    });
} else {
  useAdminAuthStore.setState({ isLoading: false });
}
