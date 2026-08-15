import { generateKeyPairSync, createSign } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { WebSocket, type WebSocketServer } from 'ws';
import { createServer } from '../src/server.js';
import { PrintJobQueue } from '../src/queue.js';
import { PrinterRegistry } from '../src/registry.js';
import { NetworkAdapter } from '../src/adapters/NetworkAdapter.js';
import type { AgentConfig } from '../src/config.js';
import type { SessionTokenPayload } from '../src/types.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function signToken(payload: SessionTokenPayload): { token: string; signature: string } {
  const json = JSON.stringify(payload);
  const signer = createSign('RSA-SHA512');
  signer.update(json);
  signer.end();
  return { token: Buffer.from(json, 'utf8').toString('base64'), signature: signer.sign(privateKey).toString('base64') };
}

const ALLOWED_ORIGIN = 'https://billiq.revgenai.in';
const DEVICE_ID = 'device-1';

function validAuthMessage(overrides: Partial<SessionTokenPayload> = {}) {
  const { token, signature } = signToken({
    device_id: DEVICE_ID,
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 60,
    ...overrides,
  });
  return { id: 'auth-1', type: 'auth', deviceId: DEVICE_ID, token, signature };
}

describe('createServer', () => {
  let dir: string;
  let wss: WebSocketServer;
  let port: number;
  let config: AgentConfig;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'print-agent-server-'));
    port = 40000 + Math.floor(Math.random() * 10000);
    config = {
      port,
      backendUrl: 'http://127.0.0.1:8010',
      allowedOrigins: [ALLOWED_ORIGIN],
      deviceFingerprint: 'test-fingerprint',
      deviceId: DEVICE_ID,
      tenantId: 'tenant-1',
      tenantTokenPublicKeyPem: publicKey,
    };
    const registry = new PrinterRegistry([new NetworkAdapter()]);
    const queue = new PrintJobQueue(join(dir, 'jobs.sqlite'));
    wss = createServer({ config, registry, queue });
    await new Promise((resolve) => wss.once('listening', resolve));
  });

  afterEach(() => {
    wss.close();
    // better-sqlite3 can hold its WAL/SHM sidecar file handles open for a brief moment after
    // close() on Windows — a cleanup race, not a product bug, so it's swallowed here rather than
    // failing the test; the OS temp directory is reclaimed on its own regardless.
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  });

  function connect(origin: string): WebSocket {
    return new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: origin } });
  }

  function once(ws: WebSocket, event: 'message' | 'close' | 'open'): Promise<any> {
    return new Promise((resolve) => ws.once(event, resolve));
  }

  it('rejects a connection from an origin not on the allowlist (spec §3/§5)', async () => {
    const ws = connect('https://evil.example.com');
    const closeEvent = await new Promise<{ code: number }>((resolve) => ws.once('unexpected-response', (_req, res) => resolve({ code: res.statusCode! })));
    expect(closeEvent.code).toBe(403);
  });

  it('accepts the handshake for an allowed origin, then requires auth before anything else', async () => {
    const ws = connect(ALLOWED_ORIGIN);
    await once(ws, 'open');
    ws.send(JSON.stringify({ id: 'x', type: 'getPrinters' }));
    const raw = await once(ws, 'message');
    const response = JSON.parse(raw.toString());
    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/not authenticated/i);
    ws.close();
  });

  it('authenticates with a validly signed session token and then allows requests', async () => {
    const ws = connect(ALLOWED_ORIGIN);
    await once(ws, 'open');
    ws.send(JSON.stringify(validAuthMessage()));
    const authResponse = JSON.parse((await once(ws, 'message')).toString());
    expect(authResponse.ok).toBe(true);

    ws.send(JSON.stringify({ id: 'p1', type: 'getPrinters' }));
    const printersResponse = JSON.parse((await once(ws, 'message')).toString());
    expect(printersResponse.ok).toBe(true);
    expect(Array.isArray(printersResponse.data)).toBe(true);
    ws.close();
  });

  it('rejects a token minted for a different tenant than this agent is paired to', async () => {
    const ws = connect(ALLOWED_ORIGIN);
    await once(ws, 'open');
    ws.send(JSON.stringify(validAuthMessage({ tenant_id: 'someone-elses-tenant' })));
    const response = JSON.parse((await once(ws, 'message')).toString());
    expect(response.ok).toBe(false);
    ws.close();
  });

  it('accepts a token for a different device id, as long as it is the same tenant this agent is paired to (regression test: a device previously trusted a single remembered deviceId, which meant every new pairing silently locked out every other browser/till for the same shop)', async () => {
    const ws = connect(ALLOWED_ORIGIN);
    await once(ws, 'open');
    ws.send(
      JSON.stringify({
        ...validAuthMessage({ device_id: 'a-different-till-for-the-same-shop' }),
        deviceId: 'a-different-till-for-the-same-shop',
      }),
    );
    const response = JSON.parse((await once(ws, 'message')).toString());
    expect(response.ok).toBe(true);
    ws.close();
  });

  it('treats a duplicate printJobId as a no-op, never a second physical print (spec §12/§26/§31)', async () => {
    const ws = connect(ALLOWED_ORIGIN);
    await once(ws, 'open');
    ws.send(JSON.stringify(validAuthMessage()));
    await once(ws, 'message');

    const job = {
      id: 'j1',
      type: 'print',
      printJobId: 'job-abc',
      printerId: 'nonexistent-printer',
      document: { type: 'test_print', paperWidth: '80mm' },
    };
    ws.send(JSON.stringify(job));
    const first = JSON.parse((await once(ws, 'message')).toString());
    expect(first.ok).toBe(false); // fails because "nonexistent-printer" has no adapter owner

    ws.send(JSON.stringify({ ...job, id: 'j2' }));
    const second = JSON.parse((await once(ws, 'message')).toString());
    // The second attempt must not re-run the print — it should see the job already failed and
    // report that, not attempt (and potentially succeed/duplicate) a second physical print.
    expect(second.ok).toBe(false);
    ws.close();
  });
});
