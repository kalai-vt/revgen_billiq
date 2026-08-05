import { describe, expect, it } from 'vitest';
import { CHART_PRIMARY, CHART_SERIES, CHART_STATUS, hexToRgba, modeFor, themeNameFor } from './theme';

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe('CHART_SERIES palette', () => {
  it('has 8 valid hex slots for both modes', () => {
    expect(CHART_SERIES.light).toHaveLength(8);
    expect(CHART_SERIES.dark).toHaveLength(8);
    for (const hex of [...CHART_SERIES.light, ...CHART_SERIES.dark]) {
      expect(hex).toMatch(HEX_RE);
    }
  });

  it('leads with the brand-purple primary in both modes', () => {
    expect(CHART_PRIMARY.light).toBe(CHART_SERIES.light[0]);
    expect(CHART_PRIMARY.dark).toBe(CHART_SERIES.dark[0]);
  });
});

describe('CHART_STATUS', () => {
  it('defines all four fixed status roles as valid hex', () => {
    for (const hex of Object.values(CHART_STATUS)) {
      expect(hex).toMatch(HEX_RE);
    }
  });
});

describe('themeNameFor / modeFor', () => {
  it('resolves next-themes state to a registered theme name', () => {
    expect(themeNameFor('dark')).toBe('billiq-dark');
    expect(themeNameFor('light')).toBe('billiq-light');
    expect(themeNameFor(undefined)).toBe('billiq-light');
    expect(themeNameFor('system')).toBe('billiq-light');
  });

  it('round-trips back to a plain mode', () => {
    expect(modeFor('billiq-dark')).toBe('dark');
    expect(modeFor('billiq-light')).toBe('light');
  });
});

describe('hexToRgba', () => {
  it('converts a hex color to an rgba() string at the given alpha', () => {
    expect(hexToRgba('#2a78d6', 0.5)).toBe('rgba(42, 120, 214, 0.5)');
  });
});
