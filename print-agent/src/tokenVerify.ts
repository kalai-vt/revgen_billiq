/** Verifies the short-lived session token the browser obtains from
 * `POST /api/printing/agent/session-token` and passes as the first WS message (spec §5's
 * "request signing" + "short-lived authentication tokens"). Verification happens entirely with
 * the cached public key from `pairing.ts::ensureTokenPublicKey` — no backend round-trip per print,
 * which is what makes offline printing possible (spec §13) while still cryptographically proving
 * the browser's claim came from a real, currently-authenticated session for THIS agent's tenant.
 *
 * Matches `backend/app/modules/printing/service.py`'s existing QZ-signing technique exactly
 * (RSA + SHA-512 + PKCS#1 v1.5), just verifying instead of signing, and against the new
 * print-agent keypair rather than the QZ one. */

import { createVerify } from 'node:crypto';
import type { SessionTokenPayload } from './types.js';

export class TokenVerificationError extends Error {}

export interface VerifiedSession {
  deviceId: string;
  tenantId: string;
  userId: string;
}

/** `token`/`signature` are the two base64 fields the session-token endpoint returns verbatim.
 * `expectedDeviceId` is this agent's own paired device id — a token minted for a different device
 * (even a legitimately signed one) must never be honored here, since that would let one device
 * present another device's tenant claim. */
export function verifySessionToken(token: string, signature: string, publicKeyPem: string, expectedDeviceId: string): VerifiedSession {
  const json = Buffer.from(token, 'base64').toString('utf8');
  const verifier = createVerify('RSA-SHA512');
  verifier.update(json);
  verifier.end();
  const isValid = verifier.verify(publicKeyPem, Buffer.from(signature, 'base64'));
  if (!isValid) throw new TokenVerificationError('Session token signature is invalid.');

  const payload = JSON.parse(json) as SessionTokenPayload;
  if (payload.device_id !== expectedDeviceId) {
    throw new TokenVerificationError('Session token was not issued for this device.');
  }
  // expires_at is Unix seconds, per the backend's session-token endpoint — Date expects
  // milliseconds, so this must be scaled or every token looks expired since 1970.
  const expiresAtMs = payload.expires_at * 1000;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    throw new TokenVerificationError('Session token has expired.');
  }
  return { deviceId: payload.device_id, tenantId: payload.tenant_id, userId: payload.user_id };
}
