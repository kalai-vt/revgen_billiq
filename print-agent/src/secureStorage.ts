/** OS-native secure secret storage (spec §5's "secure local storage / encrypted credentials" and
 * §4's "never expose sensitive credentials in the browser" — the device secret this module
 * protects is what proves the agent's identity to the backend, so it must never sit in plaintext
 * on disk).
 *
 * Windows: shells out to PowerShell's `[System.Security.Cryptography.ProtectedData]` (DPAPI),
 * scoped to the current Windows user — the same mechanism Windows Credential Manager itself is
 * built on. This is a deliberate choice over a native npm module (e.g. `keytar`, which is
 * deprecated, or DPAPI bindings that need a node-gyp toolchain to install): PowerShell ships with
 * every Windows install, so this works with zero extra native dependencies and nothing to compile.
 *
 * macOS Keychain / Android Keystore are Phase 2/3 per the migration plan (spec §27) — calling
 * `protect`/`unprotect` on an unsupported platform throws rather than silently falling back to
 * plaintext, per spec §5.
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

function runPowerShell(script: string, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `powershell exited with code ${code}`));
    });
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

// ProtectedData lives in the System.Security assembly, which plain powershell.exe does not load
// by default (unlike, say, System.Web) — without this, the type simply isn't found at runtime.
const LOAD_ASSEMBLY = 'Add-Type -AssemblyName System.Security';

const DPAPI_PROTECT = `
${LOAD_ASSEMBLY}
$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
$protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($protected))
`;

const DPAPI_UNPROTECT = `
${LOAD_ASSEMBLY}
$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($plain))
`;

/** Encrypts `plaintext` for storage on disk, scoped so only this Windows user account can decrypt
 * it again (even another admin account on the same machine cannot). Returns a base64 blob safe to
 * write to a config file. */
export async function protect(plaintext: string): Promise<string> {
  if (platform() !== 'win32') {
    throw new Error('Secure storage is only implemented for Windows in this phase — macOS Keychain support is Phase 2.');
  }
  const inputB64 = Buffer.from(plaintext, 'utf8').toString('base64');
  return runPowerShell(DPAPI_PROTECT, inputB64);
}

/** Reverses `protect()`. Throws if the blob was protected under a different Windows user account
 * or on a different machine — by design: a copied config file should not silently work elsewhere. */
export async function unprotect(blob: string): Promise<string> {
  if (platform() !== 'win32') {
    throw new Error('Secure storage is only implemented for Windows in this phase — macOS Keychain support is Phase 2.');
  }
  const outputB64 = await runPowerShell(DPAPI_UNPROTECT, blob);
  return Buffer.from(outputB64, 'base64').toString('utf8');
}
