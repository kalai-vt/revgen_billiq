/** Windows system tray icon (spec §19), via `systray2` — the actively-maintained fork of the
 * original `systray` package (confirmed: `node-systray-v2`, an earlier guess, doesn't exist on
 * npm; `systray2` does and ships real type definitions). Opens the local admin HTTP page
 * (`adminHttp.ts`) in the default browser for pairing/status/test-print rather than building a
 * native dialog toolkit into the agent.
 *
 * Genuinely optional: a tray icon can't be verified in a headless/CI environment, so failure to
 * create one logs a warning and the agent keeps running exactly as it would otherwise — every
 * actual capability (WS server, admin HTTP page) works identically with or without it. Full
 * branded icon art and "run at Windows startup" toggle UI are packaging/installer concerns (see
 * `release/`), not this module's job.
 */

import { exec } from 'node:child_process';

export interface TrayDeps {
  adminUrl: string;
  onQuit: () => void;
}

// A 32x32 PNG of the RevGenAI brand mark — indigo rounded square with the same "Zap" glyph as
// BrandLogo.tsx's fallback mark — generated once via release/assets and checked in here as a
// literal (see release/assets/tray-icon.png for the source image; regenerate both together if the
// mark ever changes rather than hand-editing this string).
const APP_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAHySURBVFhHzZctSARBFMcvGo1Go9Fouys3I4IgWK55wSA3I3cGQUyKQYPFpFgvmDSJgkEFEQUtF0QQ4UCDV1RMouE9ebvsfbzZj9mdU/zDr8ybufef2Xtvd3K5/ywtcERLLCuJK1mh9ZUijvLfjtRMHgeUhHUt4VNLxP4Ce5UJHOI52yKnSsK9ubCPCHhREgs8t7dzLaBpLPgFlIR34yS0gG0+MQ0Lk+ZYPHDcu3uHZ07Jd1fN8SSqEoc9A/TseTAN+zvZDGiBU54BJaBmBC1ZLiF+vCFuVMxYElSmvgG/Xo0JNpweoCcywmNJOBugpN9fPjxmg7OB23N/968tM2aDkwF65oEeGmbcBicDdzcdA9cnZtyGzAao5JJkUxWZDTw/8nS9sj2RTAbqmzxdr6gibEsytQFqudR04kR9ga+LIrWBtVnEo3qHoAkFInOL0+a6KFIb4HSXIoneCXxOHM4GuquBmlHaV7KzAdpxoCxvQ2cDwX+AypLHbHA2EHTDrUUzZkPbgBa4xIM2tJ4QG5fmuC3dJ1DgQRuo6di03BjKnoFqHgdDgrFQt7s4NMfT0HNh0QLO+IQ4aOe2LTcUAc12ct8AXcOyfxmnJfRyoopQ+gsT9BHMc7dFJ6EEXPFFfSHqWham+XEYUxLmqFScEVCLSvwDjaG4G9/Gxw0AAAAASUVORK5CYII=';

export async function startTray(deps: TrayDeps): Promise<{ stop: () => void } | null> {
  let SysTray: typeof import('systray2').default;
  try {
    // systray2 is TypeScript-compiled-to-CJS with its own `exports.default = SysTray` *and* an
    // `__esModule` marker. How that resolves through a dynamic import() genuinely differs by
    // runtime — confirmed empirically, not assumed: Vite/Vitest/tsx's own CJS-interop transform
    // yields `mod.default` as the class directly, while plain Node running the compiled dist/
    // output double-wraps it as `mod.default.default`. Handling both shapes here is what makes
    // this work identically in dev (tsx/vitest) and in the packaged release (plain node).
    const mod = (await import('systray2')) as unknown as { default: typeof SysTray | { default: typeof SysTray } };
    SysTray = typeof mod.default === 'function' ? mod.default : mod.default.default;
  } catch {
    console.warn('[print-agent] Tray icon unavailable on this machine (systray2 not installed) — running headless.');
    console.warn(`[print-agent] Open ${deps.adminUrl} to pair a device or run a test print.`);
    return null;
  }

  const tray = new SysTray({
    menu: {
      icon: APP_ICON,
      title: 'RevGenAI Print Agent',
      tooltip: 'RevGenAI Print Agent',
      items: [
        { title: 'Open Print Agent', tooltip: '', checked: false, enabled: true },
        { title: 'Quit', tooltip: '', checked: false, enabled: true },
      ],
    },
    debug: false,
    copyDir: true,
  });

  try {
    // systray2's constructor kicks off spawning its native tray binary asynchronously (it sets
    // `_process = null` synchronously, then assigns the real child process only once its internal
    // `init()` promise resolves) — calling onError/onClick before that finishes throws, because
    // there's no process to attach listeners to yet. `ready()` is exactly the promise that
    // resolves once the binary has actually spawned. Confirmed against systray2's own source, not
    // assumed from the type signatures alone.
    await tray.ready();
  } catch (err) {
    console.warn('[print-agent] Tray icon unavailable on this machine (native tray binary failed to start) — running headless.');
    console.warn(`[print-agent] (${err instanceof Error ? err.message : err})`);
    console.warn(`[print-agent] Open ${deps.adminUrl} to pair a device or run a test print.`);
    return null;
  }

  tray.onError((err) => console.warn('[print-agent] Tray error:', err.message));

  void tray.onClick((action) => {
    if (action.seq_id === 0) {
      const opener = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(`${opener} ${deps.adminUrl}`);
    } else if (action.seq_id === 1) {
      void tray.kill(false);
      deps.onQuit();
    }
  });

  return { stop: () => void tray.kill(false) };
}
