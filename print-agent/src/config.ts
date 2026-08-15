/** Agent configuration: the allowed-origin list (spec §3 — "make the allowed-domain system
 * configurable for future RevGenAI products"), backend URL, local WS port, and persisted pairing
 * state. Lives in a plain JSON file for everything non-secret; the device secret itself is never
 * written here in plaintext — see `pairing.ts`, which stores it separately via `secureStorage.ts`. */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, hostname, platform } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Platform } from './types.js';

export const AGENT_VERSION = '0.1.0';

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://billiq.revgenai.in',
  'https://salesiq.revgenai.in',
  // Local dev origins — real deployments should prune these via the config file below.
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function detectPlatform(): Platform {
  const p = platform();
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  return 'windows'; // Android build is a separate app entirely (spec §18) — this Node process never runs there.
}

export interface AgentConfig {
  port: number;
  backendUrl: string;
  allowedOrigins: string[];
  deviceFingerprint: string;
  /** Non-secret pairing metadata — the actual device secret lives in the OS-encrypted sibling
   * file (`device.secret`, see pairing.ts), never here. */
  deviceId: string | null;
  /** The tenant this agent was paired to — captured from the first (and every subsequent)
   * pairing. Session-token auth checks the token's tenant against *this*, not against a single
   * remembered deviceId (see server.ts's auth handler comment for why: the token-signing key is
   * one global keypair shared by every tenant, not per-tenant, so signature validity alone never
   * proves same-tenant — this field is what actually does). */
  tenantId: string | null;
  tenantTokenPublicKeyPem: string | null;
}

export function configDir(): string {
  // Override exists purely so tests can point pairing/config persistence at a throwaway temp
  // directory instead of colliding with a real ~/.revgenai-print-agent (which a genuinely running
  // agent process on this same machine may hold open concurrently) — never set in normal operation.
  return process.env.REVGENAI_PRINT_AGENT_CONFIG_DIR ?? join(homedir(), '.revgenai-print-agent');
}

function configPath(): string {
  return join(configDir(), 'config.json');
}

const DEFAULTS: Omit<AgentConfig, 'deviceFingerprint'> = {
  port: 47811,
  backendUrl: 'http://127.0.0.1:8010',
  allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
  deviceId: null,
  tenantId: null,
  tenantTokenPublicKeyPem: null,
};

export async function loadConfig(): Promise<AgentConfig> {
  const dir = configDir();
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const path = configPath();
  if (!existsSync(path)) {
    const initial: AgentConfig = { ...DEFAULTS, deviceFingerprint: `${hostname()}-${randomUUID()}` };
    await writeFile(path, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  const raw = await readFile(path, 'utf8');
  return { ...DEFAULTS, deviceFingerprint: `${hostname()}-${randomUUID()}`, ...(JSON.parse(raw) as Partial<AgentConfig>) };
}

export async function saveConfig(config: AgentConfig): Promise<void> {
  await writeFile(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

export function jobQueuePath(): string {
  return join(configDir(), 'jobs.sqlite');
}

export function secretPath(): string {
  return join(configDir(), 'device.secret');
}

export function logPath(): string {
  return join(configDir(), 'agent.log');
}
