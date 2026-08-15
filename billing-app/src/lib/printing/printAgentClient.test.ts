import { describe, expect, it } from 'vitest';
import { parseUtcTimestamp } from '@/lib/printing/printAgentClient';

describe('parseUtcTimestamp', () => {
  // Deterministic regardless of the machine's own timezone — uses Date.UTC() to compute the
  // expected instant explicitly, rather than comparing against a local Date, so this test would
  // have caught the real bug (confirmed on a UTC+5:30 machine: pairing looked like it never
  // completed because every timestamp comparison was silently off by ~5.5 hours) on any CI runner,
  // not just a non-UTC one.
  const expectedUtcMs = Date.UTC(2026, 7, 15, 10, 3, 54, 81);

  it('treats a naive timestamp with no timezone designator as UTC (the actual backend response shape)', () => {
    expect(parseUtcTimestamp('2026-08-15T10:03:54.081048')).toBe(expectedUtcMs);
  });

  it('parses a timestamp with an explicit Z suffix identically', () => {
    expect(parseUtcTimestamp('2026-08-15T10:03:54.081Z')).toBe(expectedUtcMs);
  });

  it('respects an explicit numeric offset rather than overriding it', () => {
    // 15:33:54+05:30 is the same instant as 10:03:54Z.
    expect(parseUtcTimestamp('2026-08-15T15:33:54.081+05:30')).toBe(expectedUtcMs);
  });
});
