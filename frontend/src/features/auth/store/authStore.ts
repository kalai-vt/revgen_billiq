import { create } from 'zustand';
import * as authApi from '@/features/auth/api';
import { clearTokens, getAccessToken, getRefreshToken, storeTokens } from '@/lib/api-client';
import { clearSidebarExpansionState } from '@/components/layout/sidebar/sidebarStorage';
import type { AuthResult, PlanId, Tenant, User } from '@/features/auth/api';

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  plan: PlanId | null;
  canOverridePrice: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (payload: authApi.RegisterPayload) => Promise<authApi.RegisterResult>;
  logout: () => Promise<void>;
  setTenant: (tenant: Tenant) => void;
  setPlan: (plan: PlanId) => void;
  setUser: (user: User) => void;
  swapTokens: (accessToken: string, refreshToken: string) => void;
}

async function applyAuthResult(
  set: (partial: Partial<AuthState>) => void,
  result: AuthResult,
): Promise<void> {
  storeTokens(result.access_token, result.refresh_token);
  if (result.tenant) {
    set({
      user: result.user,
      tenant: result.tenant,
      plan: result.plan ?? 'basic',
      canOverridePrice: result.can_override_price ?? false,
      isAuthenticated: true,
    });
  } else {
    set({ user: result.user, isAuthenticated: true });
    const { user, tenant, plan, can_override_price } = await authApi.me();
    set({ user, tenant, plan, canOverridePrice: can_override_price });
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  plan: null,
  canOverridePrice: false,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password, rememberMe = false) => {
    const result = await authApi.login(email, password, rememberMe);
    // Every fresh sign-in starts with all sidebar modules collapsed — never inherit expansion
    // state left over from a previous user/session on this browser.
    clearSidebarExpansionState();
    await applyAuthResult(set, result);
  },

  register: async (payload) => {
    // Registration no longer auto-logs-in — the account is pending email verification, so
    // there are no tokens to store here. The caller navigates to a "check your email" page.
    return authApi.register(payload);
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => undefined);
    }
    clearTokens();
    clearSidebarExpansionState();
    set({ user: null, tenant: null, plan: null, canOverridePrice: false, isAuthenticated: false });
  },

  setTenant: (tenant) => set({ tenant }),
  setPlan: (plan) => set({ plan }),
  setUser: (user) => set({ user }),
  swapTokens: (accessToken, refreshToken) => storeTokens(accessToken, refreshToken),
}));

// Bootstrap the session once at module load — equivalent to the mount-effect
// the old AuthContext provider ran, but Zustand stores need no provider.
if (getAccessToken()) {
  authApi
    .me()
    .then(({ user, tenant, plan, can_override_price }) =>
      useAuthStore.setState({
        user,
        tenant,
        plan,
        canOverridePrice: can_override_price,
        isAuthenticated: true,
        isLoading: false,
      }),
    )
    .catch(() => {
      clearTokens();
      useAuthStore.setState({ isLoading: false });
    });
} else {
  useAuthStore.setState({ isLoading: false });
}
