import { describe, expect, it } from 'vitest';
import {
  COMPACT_CRORE,
  COMPACT_LAKH,
  COMPACT_THOUSAND,
  formatCompactCurrency,
  formatCompactNumber,
  formatFullCurrency,
  formatFullNumber,
  formatHourLabel,
  formatPercent,
} from './formatters';

describe('formatCompactNumber', () => {
  it('renders values below the thousand threshold plainly', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('switches to K at the thousand boundary', () => {
    expect(formatCompactNumber(COMPACT_THOUSAND)).toBe('1K');
    expect(formatCompactNumber(1200)).toBe('1.2K');
    expect(formatCompactNumber(99_999)).toBe('100K');
  });

  it('switches to L at the lakh boundary', () => {
    expect(formatCompactNumber(COMPACT_LAKH)).toBe('1L');
    expect(formatCompactNumber(250_000)).toBe('2.5L');
    expect(formatCompactNumber(500_000)).toBe('5L');
  });

  it('switches to Cr at the crore boundary', () => {
    expect(formatCompactNumber(COMPACT_CRORE)).toBe('1Cr');
    expect(formatCompactNumber(24_000_000)).toBe('2.4Cr');
  });

  it('handles negative values by preserving the sign', () => {
    expect(formatCompactNumber(-1500)).toBe('-1.5K');
  });

  it('handles non-finite input safely', () => {
    expect(formatCompactNumber(NaN)).toBe('0');
  });
});

describe('formatCompactCurrency', () => {
  it('prefixes the rupee symbol', () => {
    expect(formatCompactCurrency(10_000)).toBe('₹10K');
    expect(formatCompactCurrency(500_000)).toBe('₹5L');
  });
});

describe('formatFullCurrency', () => {
  it('groups digits in the Indian numbering system with 2 decimals by default', () => {
    expect(formatFullCurrency(235_400)).toBe('₹2,35,400.00');
  });

  it('handles zero and negative amounts', () => {
    expect(formatFullCurrency(0)).toBe('₹0.00');
    expect(formatFullCurrency(-1234.5)).toBe('₹-1,234.50');
  });
});

describe('formatFullNumber', () => {
  it('groups digits without a currency symbol', () => {
    expect(formatFullNumber(1_240)).toBe('1,240');
    expect(formatFullNumber(235_400)).toBe('2,35,400');
  });
});

describe('formatPercent', () => {
  it('rounds to whole percent by default', () => {
    expect(formatPercent(18)).toBe('18%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(-4)).toBe('-4%');
  });

  it('shows a leading + for positive growth when requested', () => {
    expect(formatPercent(18, { showSign: true })).toBe('+18%');
    expect(formatPercent(-4, { showSign: true })).toBe('-4%');
    expect(formatPercent(0, { showSign: true })).toBe('0%');
  });

  it('supports decimal precision', () => {
    expect(formatPercent(18.456, { decimals: 1 })).toBe('18.5%');
  });
});

describe('formatHourLabel', () => {
  it('zero-pads hour-of-day into a 24h label', () => {
    expect(formatHourLabel(0)).toBe('00:00');
    expect(formatHourLabel(9)).toBe('09:00');
    expect(formatHourLabel(23)).toBe('23:00');
  });
});
