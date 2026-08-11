# QZ Tray Production Setup — Certificate & Signing

This covers the one missing piece that causes QZ Tray's "Action Required" popup to
reappear on every print in production: BillIQ has no certificate/private key of its own
configured, so every connection to QZ Tray arrives unsigned/anonymous. QZ Tray then has
no stable identity to remember trust for — even with "Remember this decision" checked —
and shows its own generic identity ("Verified by QZ Industries, LLC") instead of
BillIQ's.

The signing architecture itself (`backend/app/modules/printing/`) is already correct and
needs no code change: the private key lives only in a backend environment variable and
is never sent to the browser. This document is the one missing deployment step.

## 1. Generate the certificate/key pair

Run this **on your own machine, not in any shared/logged environment** — the private
key must never be pasted into a chat, ticket, or committed to source control:

```sh
openssl req -x509 -newkey rsa:2048 -keyout private-key.pem -out digital-certificate.txt \
  -days 3650 -nodes -subj "/CN=RevGen BillIQ"
```

- `-days 3650` (10 years) — QZ Tray's trust prompt shows the certificate's Common Name,
  not its expiry, so a long validity avoids an unplanned re-trust event across every
  till years from now. Rotate before expiry regardless.
- `-subj "/CN=RevGen BillIQ"` — this exact string is what will replace "QZ Industries,
  LLC" in the trust dialog. Change it if you want a different display name, but keep it
  short and recognizable to a cashier.
- `-nodes` — no passphrase on the key. The signing endpoint (`app/modules/printing/service.py`)
  loads the key at process start with no prompt; an encrypted key would require plumbing
  a passphrase into the deployment environment too, for no real security benefit here
  (the key's confidentiality already depends entirely on env var access control).

This produces two files: `private-key.pem` (secret) and `digital-certificate.txt`
(public — safe to share, it's what gets handed to every browser).

## 2. Configure production

In the Vercel project's environment variables (Production environment):

- `REVGENIQ_QZ_TRAY_PRIVATE_KEY` — paste the full contents of `private-key.pem`,
  including the `-----BEGIN/END PRIVATE KEY-----` lines.
- `REVGENIQ_QZ_TRAY_CERTIFICATE` — paste the full contents of `digital-certificate.txt`.

Redeploy so the backend process picks up the new environment variables (`backend/app/core/config.py`
reads them once at import time via `_get_private_key()`'s module-level cache — a redeploy
is required, a hot env-var change alone won't be picked up by an already-running process).

Delete both local files after pasting them into Vercel. Do not commit them, attach them
to a ticket, or leave them in a Downloads folder.

## 3. One-time re-trust per till

Because the app's signing identity is changing (from none, to "RevGen BillIQ"), every
till that has already clicked through QZ Tray's trust dialog will see it **exactly one
more time** — this time showing "RevGen BillIQ" instead of "QZ Industries, LLC". Check
"Remember this decision" and click Allow as before. From then on it will actually
persist, because there's now a stable certificate identity for QZ Tray to remember trust
against.

## 4. Manual verification script

Run this on the real Windows/QZ Tray/POS58 (or 80mm) setup — this cannot be verified
from an automated test suite, since it depends on a physical printer, a real QZ Tray
install, and real Chrome permission prompts:

1. Complete steps 1–2 above and confirm the deploy finished.
2. Open a **fresh Chrome profile** (or clear QZ Tray's trust for this site first — see
   below) and go to `https://revgenai.in/billiq/pos`.
3. Go to Settings → Automatic Printing. Confirm the new status header renders (QZ Tray /
   Local Network Access / Printer, each with a status dot).
4. Click **Detect**. Confirm the QZ Tray dialog now reads **"Verified by RevGen
   BillIQ"** (or whatever CN you chose) — not "QZ Industries, LLC". Check "Remember this
   decision" and click **Allow**.
5. Click **Test Print**. Confirm the printer outputs the test page layout (RevGen
   BillIQ / Printer Test / paper size / date-time / "Printer connection successful") —
   and confirm nothing appears under Invoices/Sales in BillIQ as a result; a test print
   must never create a transaction.
6. Complete 10 real checkouts in a row with auto-print on. Confirm **zero** further QZ
   popups.
7. Fully quit and reopen Chrome (not just the tab). Print again. Confirm still zero
   popups — this is the actual proof that trust persisted across sessions, not just
   within one.
8. Restart QZ Tray itself (system tray icon → Exit, relaunch). Print again. Confirm a
   clean reconnect with no popup, or at most QZ Tray's own one-time restart handshake
   (not a repeat of the full trust dialog).
9. Unplug/disconnect the printer, attempt a print, confirm BillIQ shows a clear "printer
   not connected" message rather than silently claiming success. Reconnect the printer
   and confirm printing resumes without restarting the browser.
10. If, at any point, Chrome shows its own **separate** "wants to connect to your local
    network" permission prompt (distinct from QZ Tray's own dialog — this is Chrome
    147+'s Local Network Access feature, not a QZ Tray dialog): confirm BillIQ's own
    explainer screen appeared *before* that browser prompt, with wording distinct from
    the QZ Tray trust dialog. This one is a genuine one-time browser permission — it
    cannot be eliminated by BillIQ, only clearly explained.

Report back specifically: what the trust dialog's certificate name read in step 4, and
whether the Chrome LNA prompt in step 10 ever appeared and what it looked like. Those
two are the only outcomes that depend on the real browser/OS rather than on code in this
repo.

## Resetting QZ Tray's local trust state (for re-testing only)

QZ Tray stores its per-site trust decisions in `%APPDATA%\qz\allowed.dat` (allowed) and
a corresponding blocked list on the same machine. To force step 4 above to show the
trust dialog again for testing (e.g. after generating a new certificate), close QZ Tray
and delete or rename that file, then relaunch QZ Tray. This is a local, manual,
user-initiated action for testing only — BillIQ's own code must never read, write, or
delete this file automatically.
