import { platform } from 'node:os';
import { describe, expect, it } from 'vitest';
import { protect, unprotect } from '../src/secureStorage.js';

// Windows-only — this is a real DPAPI round-trip via powershell.exe, not a mock, since the whole
// point is to catch environment issues like the missing System.Security assembly load (a bug this
// test caught before wiring it into the pairing flow — see secureStorage.ts's comment).
describe.skipIf(platform() !== 'win32')('secureStorage (Windows DPAPI)', () => {
  it('round-trips a secret through protect/unprotect', async () => {
    const secret = 'a-very-secret-device-token-1234567890';
    const blob = await protect(secret);
    expect(blob).not.toContain(secret);
    const recovered = await unprotect(blob);
    expect(recovered).toBe(secret);
  });

  it('round-trips strings containing unicode and special characters', async () => {
    const secret = 'ñ¿emoji-🔒-and-"quotes"-and-newlines\n\r\t';
    const blob = await protect(secret);
    const recovered = await unprotect(blob);
    expect(recovered).toBe(secret);
  });
});
