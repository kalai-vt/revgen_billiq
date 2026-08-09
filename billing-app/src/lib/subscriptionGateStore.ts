import { create } from 'zustand';

/**
 * Tracks whether the backend has told us (via a 402 SUBSCRIPTION_REQUIRED response, see
 * api-client.ts's `request()`) that the current tenant's subscription is blocking normal app
 * usage. This is deliberately NOT the source of truth for whether the trial has expired — the
 * backend's response on each request is — this store just remembers the *last* answer so a
 * high-level component (AppShell) can short-circuit rendering to the suspension screen without
 * every page needing to know about 402s individually.
 *
 * Populated two ways, both converging on the same store: (1) reactively, by api-client.ts the
 * instant any request comes back 402 SUBSCRIPTION_REQUIRED, and (2) proactively, by AppShell
 * syncing it from GET /api/billing/usage's `subscription_status` on mount/refetch — see
 * AppShell.tsx. Cleared on logout (authStore.ts) so a signed-out-then-signed-in-elsewhere browser
 * never carries a stale block across sessions.
 */
export interface SubscriptionBlockInfo {
  message: string;
  subscriptionStatus?: string | null;
  suspensionReason?: string | null;
}

interface SubscriptionGateState {
  blocked: boolean;
  info: SubscriptionBlockInfo | null;
  setBlocked: (info: SubscriptionBlockInfo) => void;
  clear: () => void;
}

export const useSubscriptionGateStore = create<SubscriptionGateState>((set) => ({
  blocked: false,
  info: null,
  setBlocked: (info) => set({ blocked: true, info }),
  clear: () => set({ blocked: false, info: null }),
}));
