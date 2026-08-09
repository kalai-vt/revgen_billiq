import { useSubscriptionGateStore } from '@/lib/subscriptionGateStore';

const ACCESS_TOKEN_KEY = 'revgeniq_access_token';
const REFRESH_TOKEN_KEY = 'revgeniq_refresh_token';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

/**
 * Structured shape of `detail` on the one HTTPException in the backend that raises with a dict
 * instead of a string — `enforce_subscription_access` (app/core/subscription_access.py) on a 402.
 * FastAPI's default HTTPException handler serializes that as a bare `{"detail": {...}}` at the
 * top level, NOT wrapped in the app's usual `make_response` envelope (that envelope is only
 * produced by handlers that call `make_response` themselves, which the default HTTPException path
 * never does) — so this does not have `success`/`message` keys alongside it the way a normal
 * envelope response would.
 */
export interface SubscriptionRequiredDetail {
  code: 'SUBSCRIPTION_REQUIRED';
  message: string;
  subscription_status: string;
  suspension_reason: string | null;
}

export class ApiError extends Error {
  status: number;
  /** Present only for the structured-`detail` 402 case above; every other error path leaves this undefined. */
  detail?: SubscriptionRequiredDetail;
  constructor(status: number, message: string, detail?: SubscriptionRequiredDetail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function isSubscriptionRequiredDetail(value: unknown): value is SubscriptionRequiredDetail {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: unknown }).code === 'SUBSCRIPTION_REQUIRED'
  );
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      clearTokens();
      return false;
    }
    const body = (await response.json()) as ApiEnvelope<{ access_token: string; refresh_token: string }>;
    if (!body.success || !body.data) {
      clearTokens();
      return false;
    }
    storeTokens(body.data.access_token, body.data.refresh_token);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const accessToken = getAccessToken();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401 && retry && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, false);
  }

  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & { detail?: unknown };
  if (!response.ok || body.success === false) {
    if (isSubscriptionRequiredDetail(body.detail)) {
      // Notify the app-wide gate the instant any request comes back blocked — AppShell reads
      // this to short-circuit straight to the suspension screen, regardless of which page or
      // query triggered it. See subscriptionGateStore.ts for why this lives outside React state.
      useSubscriptionGateStore.getState().setBlocked({
        message: body.detail.message,
        subscriptionStatus: body.detail.subscription_status,
        suspensionReason: body.detail.suspension_reason,
      });
      throw new ApiError(response.status, body.detail.message, body.detail);
    }
    const detailMessage = typeof body.detail === 'string' ? body.detail : undefined;
    const message = detailMessage || body.message || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return body.data as T;
}

export async function requestBlob(path: string, options: RequestInit = {}, retry = true): Promise<Blob> {
  const headers = new Headers(options.headers);
  const accessToken = getAccessToken();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401 && retry && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) return requestBlob(path, options, false);
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Request failed with status ${response.status}`);
  }
  return response.blob();
}
