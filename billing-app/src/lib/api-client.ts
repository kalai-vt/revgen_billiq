const ACCESS_TOKEN_KEY = 'revgeniq_access_token';
const REFRESH_TOKEN_KEY = 'revgeniq_refresh_token';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & { detail?: string };
  if (!response.ok || body.success === false) {
    const message = body.detail || body.message || `Request failed with status ${response.status}`;
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
