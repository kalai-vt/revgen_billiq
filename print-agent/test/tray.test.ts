import { platform } from 'node:os';
import { describe, expect, it } from 'vitest';
import { startTray } from '../src/tray.js';

// Windows-only, and a real interactive desktop session is required for systray2's native binary
// to actually create an icon — this test runs against the genuine package (no mocking) precisely
// because a mock would have hidden the real bug it caught: systray2's dynamic-import shape is
// double-wrapped (`mod.default.default`, not `mod.default` — see tray.ts's comment), which no
// amount of type-checking against a hand-written mock would ever have surfaced.
describe.skipIf(platform() !== 'win32')('startTray', () => {
  it('constructs and tears down a real systray2 instance without throwing', async () => {
    const handle = await startTray({ adminUrl: 'http://127.0.0.1:47812/', onQuit: () => {} });
    expect(handle).not.toBeNull();
    handle?.stop();
  });
});
