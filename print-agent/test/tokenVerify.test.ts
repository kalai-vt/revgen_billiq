import { generateKeyPairSync, createSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySessionToken, TokenVerificationError } from '../src/tokenVerify.js';
import type { SessionTokenPayload } from '../src/types.js';

/** Signs a payload the same way `backend/app/modules/printing/service.py::sign_session_token`
 * does — RSA + SHA-512 + PKCS#1 v1.5 over the raw JSON string bytes — so this test exercises the
 * real cross-language contract, not just this module's own round-trip. */
function signPayload(payload: SessionTokenPayload, privateKeyPem: string): { token: string; signature: string } {
  const json = JSON.stringify(payload);
  const signer = createSign('RSA-SHA512');
  signer.update(json);
  signer.end();
  const signature = signer.sign(privateKeyPem).toString('base64');
  return { token: Buffer.from(json, 'utf8').toString('base64'), signature };
}

describe('verifySessionToken', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  function payload(overrides: Partial<SessionTokenPayload> = {}): SessionTokenPayload {
    return {
      device_id: 'device-1',
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      issued_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 60,
      ...overrides,
    };
  }

  it('accepts a validly signed, unexpired token for the expected device', () => {
    const { token, signature } = signPayload(payload(), privateKey);
    const result = verifySessionToken(token, signature, publicKey, 'device-1');
    expect(result).toEqual({ deviceId: 'device-1', tenantId: 'tenant-1', userId: 'user-1' });
  });

  it('rejects a token whose signature does not verify against the public key (tamper/wrong key)', () => {
    const { token } = signPayload(payload(), privateKey);
    const otherKeypair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const { signature: wrongSignature } = signPayload(payload(), otherKeypair.privateKey);
    expect(() => verifySessionToken(token, wrongSignature, publicKey, 'device-1')).toThrow(TokenVerificationError);
  });

  it('rejects an expired token even with a valid signature', () => {
    const { token, signature } = signPayload(payload({ expires_at: Math.floor(Date.now() / 1000) - 1 }), privateKey);
    expect(() => verifySessionToken(token, signature, publicKey, 'device-1')).toThrow(/expired/);
  });

  it('rejects a token minted for a different device — one device cannot use another device\'s token', () => {
    const { token, signature } = signPayload(payload({ device_id: 'device-2' }), privateKey);
    expect(() => verifySessionToken(token, signature, publicKey, 'device-1')).toThrow(/not issued for this device/);
  });

  it('rejects a tampered payload (bit-flipped JSON) even if the signature field is untouched', () => {
    const { signature } = signPayload(payload(), privateKey);
    const tamperedToken = Buffer.from(JSON.stringify(payload({ tenant_id: 'attacker-tenant' })), 'utf8').toString('base64');
    expect(() => verifySessionToken(tamperedToken, signature, publicKey, 'device-1')).toThrow(TokenVerificationError);
  });
});
