import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { AgentConfig } from '../src/config.js';

// Windows-only — pairDevice writes the device secret through secureStorage.protect(), which is a
// real DPAPI round-trip via powershell.exe (see secureStorage.test.ts) with no other-platform
// implementation yet.
describe.skipIf(platform() !== 'win32')('pairDevice', () => {
  let dir: string;
  let config: AgentConfig;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'print-agent-pairing-'));
    process.env.REVGENAI_PRINT_AGENT_CONFIG_DIR = dir;
    config = {
      port: 47811,
      backendUrl: 'http://127.0.0.1:8010',
      allowedOrigins: [],
      deviceFingerprint: 'test-fingerprint',
      deviceId: null,
      tenantId: null,
      tenantTokenPublicKeyPem: null,
    };
    fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/printing/agent/pair')) {
        return new Response(
          JSON.stringify({ data: { device_id: 'device-xyz', device_secret: 'super-secret', tenant_id: 'tenant-xyz' } }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/printing/agent/token-public-key')) {
        return new Response(JSON.stringify({ data: { public_key: '-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----' } }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.REVGENAI_PRINT_AGENT_CONFIG_DIR;
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  });

  it('mutates the caller\'s config object in place — the live in-memory object server.ts holds must reflect pairing immediately, not just the copy written to disk', async () => {
    const { pairDevice } = await import('../src/pairing.js');
    const result = await pairDevice(config, '123456');

    expect(result.deviceId).toBe('device-xyz');
    // Regression test for the exact bug this caught during manual e2e verification: an earlier
    // version created a *new* config object internally and only persisted that copy to disk,
    // leaving the shared in-memory `config` reference (the one server.ts's WS handler actually
    // reads deviceId/tenantTokenPublicKeyPem from) unchanged — so the first auth attempt right
    // after pairing failed with "no cached verification key yet" even though pairing succeeded.
    expect(config.deviceId).toBe('device-xyz');
    expect(config.tenantId).toBe('tenant-xyz');
    expect(config.tenantTokenPublicKeyPem).toContain('FAKE');
  });

  it('fetches and caches the token public key as part of pairing, without a separate call', async () => {
    const { pairDevice } = await import('../src/pairing.js');
    await pairDevice(config, '123456');
    const publicKeyCalls = fetchMock.mock.calls.filter(([url]: [string]) => url.endsWith('/token-public-key'));
    expect(publicKeyCalls).toHaveLength(1);
  });
});
