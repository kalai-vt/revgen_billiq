/** Chrome 147+ (and equivalent Chromium-based Edge) Local Network Access (LNA) — a browser-level
 * permission, entirely separate from QZ Tray's own certificate trust dialog, required before a
 * page can open a WebSocket to a loopback address (QZ Tray listens on localhost). See
 * docs/qz-tray-production-setup.md for how this differs from the QZ trust popup.
 *
 * qz-tray.js 2.2.6 (the current/latest version — see package.json) has no built-in LNA
 * detection of its own (that lands in a not-yet-released 2.3.0 via an optional qz-lna module),
 * so this checks the standard Permissions API directly instead of depending on QZ's SDK for it. */

export type LnaState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** 'loopback-network' is the correct permission name for a loopback (127.0.0.1/localhost)
 * target like QZ Tray; 'local-network-access' is the older Chromium alias some builds still
 * expose. Neither exists on browsers without LNA at all (older Chrome, Firefox, Safari,
 * pre-147 Edge) — `navigator.permissions.query` throws a TypeError there, which this treats as
 * 'unsupported' rather than a failure, so nothing changes for those users. */
export async function checkLocalNetworkAccess(): Promise<LnaState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
  for (const name of ['loopback-network', 'local-network-access']) {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      return status.state as LnaState;
    } catch {
      // Try the next name; if none are recognized, fall through to 'unsupported' below.
    }
  }
  return 'unsupported';
}
