import { platform } from 'node:os';
import { describe, expect, it } from 'vitest';
import { protect, unprotect } from '../src/secureStorage.js';

// Windows-only — this is a real DPAPI round-trip via powershell.exe, not a mock, since the whole
// point is to catch environment issues like the missing System.Security assembly load (a bug this
// test caught before wiring it into the pairing flow — see secureStorage.ts's comment).
// Each case below spawns powershell.exe twice (once per protect/unprotect), and its cold start —
// not DPAPI itself — dominates the wall time, routinely landing just either side of vitest's 5s
// default under load. Budgeted the same way, and for the same reason, as osPrinterAdapter's tests.
const POWERSHELL_ROUNDTRIP_TIMEOUT_MS = 15_000;

describe.skipIf(platform() !== 'win32')('secureStorage (Windows DPAPI)', () => {
  it(
    'round-trips a secret through protect/unprotect',
    async () => {
      const secret = 'a-very-secret-device-token-1234567890';
      const blob = await protect(secret);
      expect(blob).not.toContain(secret);
      const recovered = await unprotect(blob);
      expect(recovered).toBe(secret);
    },
    POWERSHELL_ROUNDTRIP_TIMEOUT_MS,
  );

  it(
    'round-trips strings containing unicode and special characters',
    async () => {
      const secret = 'ñ¿emoji-🔒-and-"quotes"-and-newlines\n\r\t';
      const blob = await protect(secret);
      const recovered = await unprotect(blob);
      expect(recovered).toBe(secret);
    },
    POWERSHELL_ROUNDTRIP_TIMEOUT_MS,
  );
});
