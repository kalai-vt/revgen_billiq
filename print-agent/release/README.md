# Building the RevGenAI Print Agent Windows installer

This produces `RevGenAI-Print-Agent-Setup-<version>.exe` — a self-contained installer that needs
nothing pre-installed on the customer's machine (it bundles its own portable Node runtime and all
native dependencies), installs per-user with no admin rights, adds Start Menu + Startup shortcuts,
and registers a proper uninstaller in Windows' "Installed Apps" list.

## Prerequisites (one-time, per build machine)

- [Inno Setup](https://jrsoftware.org/isdl.php) 6/7 — `ISCC.exe` must be on disk (this was
  installed to `C:\Program Files\Inno Setup 7` when this release was built; adjust the path below
  if yours differs).
- Node.js and npm (for building the agent itself).

## Build steps

```powershell
# 1. Build and test the agent
cd print-agent
npm install
npm run build
npm test   # 33/33 should pass

# 2. Stage a clean production bundle (dist + prod-only node_modules, native deps included)
Remove-Item -Recurse -Force release\stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path release\stage\app | Out-Null
Copy-Item dist release\stage\app\dist -Recurse
Copy-Item package.json release\stage\app\package.json
cd release\stage\app
npm install --omit=dev
cd ..\..\..

# 3. Download a portable Node runtime matching the version you developed against
#    (adjust the version number to match `node --version`)
Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip" -OutFile "$env:TEMP\node-portable.zip"
Expand-Archive -Path "$env:TEMP\node-portable.zip" -DestinationPath "$env:TEMP\node-portable-extract" -Force
Copy-Item "$env:TEMP\node-portable-extract\node-v22.14.0-win-x64\node.exe" release\stage\node.exe

# 4. Compile the installer
& "C:\Program Files\Inno Setup 7\ISCC.exe" release\installer.iss
# → release\dist-installer\RevGenAI-Print-Agent-Setup-<version>.exe

# 5. Sign it (see "Code signing" below)
```

## What's in the bundle

```
release/stage/
  node.exe              ← portable Node runtime (~83MB, downloaded fresh each build)
  app/
    dist/                ← compiled agent (npm run build output)
    node_modules/        ← production deps only, installed fresh in the staging dir
    package.json
release/launcher.vbs     ← runs node.exe with a hidden console window (spec §19: background service)
release/assets/icon.ico  ← branded installer/shortcut icon (indigo mark, matches BrandLogo.tsx)
release/installer.iss    ← the Inno Setup script itself
```

The installer places all of this under `%LOCALAPPDATA%\RevGenAI Print Agent\`, with Start Menu +
Startup shortcuts both pointing at `wscript.exe launcher.vbs` (never `node.exe` directly — that
would show a visible console window every time).

## Code signing

**This build ships with a self-signed development certificate.** It proves the signing pipeline
works end-to-end (verified: `Set-AuthenticodeSignature` embeds a real Authenticode signature +
a real trusted timestamp from DigiCert), but Windows will correctly report it as untrusted —
SmartScreen will warn ("Windows protected your PC") the first time a customer downloads and runs
it. This is expected and matches what was flagged as the real blocker before customer distribution.

**To ship for real:** purchase an Authenticode code-signing certificate (OV or EV, from any CA —
DigiCert, Sectigo, SSL.com, etc., roughly $100–400/yr), then swap the signing step:

```powershell
# Self-signed (dev, what this release uses):
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=..." -CertStoreLocation "Cert:\CurrentUser\My"
Set-AuthenticodeSignature -FilePath <installer.exe> -Certificate $cert -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com"

# Real cert (production) — same command, just import the real cert first:
Import-PfxCertificate -FilePath revgenai-codesign.pfx -CertStoreLocation Cert:\CurrentUser\My -Password $pfxPassword
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object Subject -like "*RevGenAI*"
Set-AuthenticodeSignature -FilePath <installer.exe> -Certificate $cert -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com"
```

No code changes needed — same command, same signing target, just a real certificate. Sign the
installer `.exe` itself; individually signing `node.exe`/`app/dist/*.js` inside it isn't necessary
since Windows' trust decision is made on the installer executable the user actually runs.

## Cutting a new version

1. Bump `version` in `print-agent/package.json` and `#define MyAppVersion` in `installer.iss` (keep
   them in sync — nothing currently enforces this automatically).
2. Repeat the build steps above.
3. `AppId` in `installer.iss` is a fixed GUID — do not change it. Inno uses it to recognize
   upgrades vs. fresh installs; changing it would make a new version look like a different
   application to Windows (breaking in-place upgrade and leaving the old one still listed).

## Known limitations (Phase 1)

- Windows only — macOS/Android packaging is a separate, later phase (needs Apple Developer
  Program + Mac hardware, and Android Studio/Play Console respectively).
- No auto-update mechanism yet (spec §22) — a version bump means customers reinstall manually.
- Uninstall/reinstall while the agent is running relies on Inno's default "file in use" retry
  prompt rather than force-killing it — deliberate: a blanket `taskkill /IM node.exe` would kill
  *any* Node process on the machine, not just this one, which is worse than asking the user to
  close it first.
- The tray icon is a small generated placeholder derived from BrandLogo.tsx's mark, not final
  design-reviewed brand art.
