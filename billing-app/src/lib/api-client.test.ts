import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from '@/lib/api-client';
import { useSubscriptionGateStore } from '@/lib/subscriptionGateStore';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('api-client request()', () => {
  beforeEach(() => {
    localStorage.clear();
    useSubscriptionGateStore.setState({ blocked: false, info: null });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the envelope\'s data on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { success: true, message: 'ok', data: { id: '1' } }));

    const result = await request<{ id: string }>('/api/whatever');

    expect(result).toEqual({ id: '1' });
  });

  it('throws an ApiError using the plain-string `detail` FastAPI sends for ordinary HTTPExceptions', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { detail: 'This account has been suspended. Please contact support.' }));

    await expect(request('/api/customers')).rejects.toMatchObject({
      status: 403,
      message: 'This account has been suspended. Please contact support.',
    });
    // Only the SUBSCRIPTION_REQUIRED shape should ever populate the gate store.
    expect(useSubscriptionGateStore.getState().blocked).toBe(false);
  });

  it('parses the structured SUBSCRIPTION_REQUIRED 402 body exactly as enforce_subscription_access sends it', async () => {
    // This is the literal shape FastAPI's default HTTPException handler produces for
    // `raise HTTPException(status_code=402, detail={...})` — a bare `{"detail": {...}}` at the
    // top level, NOT wrapped in the app's usual `make_response` envelope (no `success`/`message`
    // alongside it). See app/core/subscription_access.py:enforce_subscription_access.
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(402, {
        detail: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Your trial has ended. Please subscribe to continue using BillIQ.',
          subscription_status: 'suspended',
          suspension_reason: 'TRIAL_EXPIRED',
        },
      }),
    );

    let caught: unknown;
    try {
      await request('/api/customers');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.status).toBe(402);
    expect(error.message).toBe('Your trial has ended. Please subscribe to continue using BillIQ.');
    expect(error.detail).toEqual({
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Your trial has ended. Please subscribe to continue using BillIQ.',
      subscription_status: 'suspended',
      suspension_reason: 'TRIAL_EXPIRED',
    });

    // The global gate store must be populated as a side effect, independent of whether the
    // caller is inside a react-query hook — AppShell reads this to short-circuit rendering.
    const gate = useSubscriptionGateStore.getState();
    expect(gate.blocked).toBe(true);
    expect(gate.info).toEqual({
      message: 'Your trial has ended. Please subscribe to continue using BillIQ.',
      subscriptionStatus: 'suspended',
      suspensionReason: 'TRIAL_EXPIRED',
    });
  });
});
