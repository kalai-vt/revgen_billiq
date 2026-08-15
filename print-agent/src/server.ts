/** The agent's local WebSocket API (spec §3). Every security requirement from spec §5/§6 is
 * enforced here, in this order, before any print is attempted:
 *
 *   1. Origin allowlist — checked at the WS handshake itself, before a connection is even accepted.
 *   2. Auth — the first message on every connection must be a valid, unexpired, signature-verified
 *      session token for THIS agent's paired device (see tokenVerify.ts). No other message type is
 *      accepted before auth succeeds.
 *   3. Rate limiting — per (origin, device) token bucket.
 *   4. Duplicate/replay protection — the job queue rejects a re-sent printJobId as a no-op echo,
 *      never as a second physical print (spec §12/§26 — a failed print must be retryable without
 *      ever risking a duplicate).
 *
 * Pairing itself does NOT go through this socket — see pairing.ts's comment for why (a browser
 * page has no way to prove it's the legitimate owner of a pairing code typed into the OS-native
 * tray prompt; routing pairing through an *unauthenticated* WS message would reintroduce exactly
 * the "any local script can talk to the agent" problem this whole redesign exists to close).
 */

import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { AgentConfig } from './config.js';
import { AGENT_VERSION, detectPlatform } from './config.js';
import { verifySessionToken, TokenVerificationError } from './tokenVerify.js';
import { PrinterRegistry, UnknownPrinterError } from './registry.js';
import { PrintJobQueue } from './queue.js';
import { TokenBucket } from './rateLimit.js';
import type { PrintJobRequest } from './types.js';
import { logger } from './log.js';

interface RpcRequest {
  id: string;
  type: 'auth' | 'getPrinters' | 'getStatus' | 'print' | 'testPrint' | 'cancel';
  [key: string]: unknown;
}

interface RpcResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface ConnectionState {
  authenticated: boolean;
  tenantId?: string;
  deviceId?: string;
  userId?: string;
}

export interface ServerDeps {
  config: AgentConfig;
  registry: PrinterRegistry;
  queue: PrintJobQueue;
}

const AUTH_TIMEOUT_MS = 5000;

export function createServer({ config, registry, queue }: ServerDeps): WebSocketServer {
  const rateLimiter = new TokenBucket(30, 0.5); // 30 burst, refills at 1 per 2s (~30/min sustained)

  const wss = new WebSocketServer({
    port: config.port,
    host: '127.0.0.1',
    verifyClient: (info: { origin: string; req: IncomingMessage }, callback) => {
      const origin = info.origin;
      if (!origin || !config.allowedOrigins.includes(origin)) {
        callback(false, 403, 'Origin not authorized');
        return;
      }
      callback(true);
    },
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const origin = req.headers.origin ?? 'unknown';
    const state: ConnectionState = { authenticated: false };

    const authTimer = setTimeout(() => {
      if (!state.authenticated) {
        send(ws, { id: 'auth', ok: false, error: 'Authentication timed out.' });
        ws.close(4401, 'auth timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (raw) => {
      void handleMessage(raw.toString(), origin, ws, state, { config, registry, queue }, rateLimiter, authTimer);
    });

    ws.on('close', () => clearTimeout(authTimer));
  });

  return wss;
}

function send(ws: WebSocket, response: RpcResponse): void {
  ws.send(JSON.stringify(response));
}

async function handleMessage(
  raw: string,
  origin: string,
  ws: WebSocket,
  state: ConnectionState,
  deps: ServerDeps,
  rateLimiter: TokenBucket,
  authTimer: NodeJS.Timeout,
): Promise<void> {
  let request: RpcRequest;
  try {
    request = JSON.parse(raw) as RpcRequest;
  } catch {
    send(ws, { id: 'unknown', ok: false, error: 'Malformed request.' });
    return;
  }

  if (!state.authenticated) {
    if (request.type !== 'auth') {
      send(ws, { id: request.id, ok: false, error: 'Not authenticated.' });
      return;
    }
    try {
      const { deviceId, token, signature } = request as unknown as { deviceId: string; token: string; signature: string };
      if (!deps.config.deviceId || !deps.config.tenantId) throw new TokenVerificationError('This agent is not paired yet.');
      if (!deps.config.tenantTokenPublicKeyPem) throw new TokenVerificationError('This agent has no cached verification key yet.');
      const verified = verifySessionToken(token, signature, deps.config.tenantTokenPublicKeyPem, deviceId);
      // Trust is scoped to the *tenant* this agent was paired to, not to one single remembered
      // deviceId. The session-token signing key is one global keypair shared by every tenant (see
      // tokenVerify.ts), so a valid signature alone never proves the token belongs to the same
      // tenant — checking tenantId is what actually does that, and it's the right boundary: any
      // browser/till belonging to the tenant that paired this agent is legitimately allowed to use
      // it, the same way multiple checkout counters in one shop share one back-office printer.
      // (An earlier version of this check compared deviceId instead, which meant every *new*
      // pairing silently locked out every previously-paired browser for the same tenant — the
      // exact failure this comment is here to stop someone reintroducing.)
      if (verified.tenantId !== deps.config.tenantId) throw new TokenVerificationError('Token tenant does not match this agent.');
      state.authenticated = true;
      state.tenantId = verified.tenantId;
      state.deviceId = verified.deviceId;
      state.userId = verified.userId;
      clearTimeout(authTimer);
      send(ws, { id: request.id, ok: true, data: { agentVersion: AGENT_VERSION, platform: detectPlatform() } });
    } catch (err) {
      send(ws, { id: request.id, ok: false, error: err instanceof Error ? err.message : 'Authentication failed.' });
      ws.close(4401, 'auth failed');
    }
    return;
  }

  // Every authenticated request is rate-limited per (origin, device) — one tab flooding requests
  // never starves a different tenant/origin sharing this agent.
  if (!rateLimiter.consume(`${origin}:${state.deviceId}`)) {
    send(ws, { id: request.id, ok: false, error: 'Rate limit exceeded. Slow down.' });
    return;
  }

  try {
    switch (request.type) {
      case 'getPrinters': {
        const printers = await deps.registry.discover();
        send(ws, { id: request.id, ok: true, data: printers });
        break;
      }
      case 'getStatus': {
        const printers = await deps.registry.discover();
        send(ws, {
          id: request.id,
          ok: true,
          data: { agentVersion: AGENT_VERSION, platform: detectPlatform(), paired: true, deviceId: state.deviceId, printers },
        });
        break;
      }
      case 'print':
      case 'testPrint': {
        const job = request as unknown as PrintJobRequest & RpcRequest;
        await runPrintJob(deps, job);
        send(ws, { id: request.id, ok: true, data: { printJobId: job.printJobId, status: 'completed' } });
        break;
      }
      case 'cancel': {
        const { printerId, printJobId } = request as unknown as { printerId: string; printJobId: string };
        const adapter = await deps.registry.forPrinter(printerId);
        await adapter.cancel(printerId, printJobId);
        deps.queue.setStatus(printJobId, 'cancelled');
        send(ws, { id: request.id, ok: true });
        break;
      }
      default:
        send(ws, { id: request.id, ok: false, error: `Unknown request type: ${request.type}` });
    }
  } catch (err) {
    send(ws, { id: request.id, ok: false, error: describeError(err) });
  }
}

async function runPrintJob(deps: ServerDeps, job: PrintJobRequest): Promise<void> {
  const { record, isNew } = deps.queue.enqueue(job.printJobId, job.printerId, job.document.type);
  if (!isNew) {
    // Same printJobId seen before — this is a retry/duplicate network send, not a new physical
    // print. Never re-run the job; the original outcome already stands (spec §12/§26).
    if (record.status === 'completed') return;
    if (record.status === 'failed') throw new Error(record.errorCode ?? 'This job previously failed.');
    return;
  }
  deps.queue.setStatus(job.printJobId, 'printing');
  try {
    const adapter = await deps.registry.forPrinter(job.printerId);
    const capabilities = await adapter.getCapabilities(job.printerId);
    await adapter.print(job.printerId, job.document, capabilities);
    deps.queue.setStatus(job.printJobId, 'completed');
  } catch (err) {
    deps.queue.setStatus(job.printJobId, 'failed', describeError(err));
    throw err;
  }
}

/** Maps internal errors to the user-facing messages spec §25 specifies verbatim where a direct
 * match exists, falling back to the underlying message otherwise. */
function describeError(err: unknown): string {
  if (err instanceof UnknownPrinterError) {
    // The user-facing message stays the short, spec-mandated phrasing — but that alone gives no
    // way to tell "this printer was never configured" apart from "it was detected a second ago
    // and a fresh discover() just failed to find it again" (see registry.ts's discover() logging).
    // Logging the specific printerId here is what makes that second case diagnosable at all.
    logger.error(`[print-agent] ${err.message}`);
    return 'Unsupported printer detected.';
  }
  if (err instanceof Error) {
    // Every other print/RPC failure (raw spooler write errors, PDF rendering errors, etc.) is
    // already safe to show the user verbatim (see adapters' own error messages) — but it still
    // needs to land in the log file, or a hidden-launch agent leaves no trace of what actually
    // went wrong on a failed checkout print.
    logger.error(`[print-agent] Print/RPC error: ${err.message}`);
    return err.message;
  }
  logger.error('[print-agent] Print/RPC error (non-Error thrown):', err);
  return 'Printing failed. Retry?';
}
