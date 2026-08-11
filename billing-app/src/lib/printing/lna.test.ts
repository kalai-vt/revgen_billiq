import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkLocalNetworkAccess } from '@/lib/printing/lna';

const originalPermissions = navigator.permissions;

afterEach(() => {
  Object.defineProperty(navigator, 'permissions', { value: originalPermissions, configurable: true });
});

function mockQuery(impl: (descriptor: PermissionDescriptor) => Promise<{ state: string }>) {
  Object.defineProperty(navigator, 'permissions', {
    value: { query: vi.fn(impl) },
    configurable: true,
  });
}

describe('checkLocalNetworkAccess', () => {
  it('returns "granted" when the browser reports the permission granted', async () => {
    mockQuery(async () => ({ state: 'granted' }));
    expect(await checkLocalNetworkAccess()).toBe('granted');
  });

  it('returns "denied" when the browser reports the permission denied', async () => {
    mockQuery(async () => ({ state: 'denied' }));
    expect(await checkLocalNetworkAccess()).toBe('denied');
  });

  it('returns "prompt" when the browser has not yet decided', async () => {
    mockQuery(async () => ({ state: 'prompt' }));
    expect(await checkLocalNetworkAccess()).toBe('prompt');
  });

  it('falls back to the legacy "local-network-access" alias when "loopback-network" is unrecognized', async () => {
    mockQuery(async (descriptor) => {
      if ((descriptor.name as string) === 'loopback-network') throw new TypeError('Unrecognized permission name');
      return { state: 'granted' };
    });
    expect(await checkLocalNetworkAccess()).toBe('granted');
  });

  it('returns "unsupported" when the Permissions API rejects every known LNA permission name', async () => {
    mockQuery(async () => {
      throw new TypeError('Unrecognized permission name');
    });
    expect(await checkLocalNetworkAccess()).toBe('unsupported');
  });

  it('returns "unsupported" when navigator.permissions does not exist at all (older browsers)', async () => {
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
    expect(await checkLocalNetworkAccess()).toBe('unsupported');
  });
});
