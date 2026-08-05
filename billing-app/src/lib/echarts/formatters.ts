// Centralized number/currency/percent/date formatting for charts. Pure functions,
// no React/echarts imports, so they're unit-testable in isolation and reusable
// from tooltip formatters, axis label formatters, and CSV export alike.

export const COMPACT_THOUSAND = 1_000;
export const COMPACT_LAKH = 100_000;
export const COMPACT_CRORE = 10_000_000;

function trimTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

/** Compact Indian notation: 1,200 -> "1.2K", 235000 -> "2.35L", 12000000 -> "1.2Cr". */
export function formatCompactNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= COMPACT_CRORE) return `${sign}${trimTrailingZeros((abs / COMPACT_CRORE).toFixed(decimals))}Cr`;
  if (abs >= COMPACT_LAKH) return `${sign}${trimTrailingZeros((abs / COMPACT_LAKH).toFixed(decimals))}L`;
  if (abs >= COMPACT_THOUSAND) return `${sign}${trimTrailingZeros((abs / COMPACT_THOUSAND).toFixed(decimals))}K`;
  return `${sign}${trimTrailingZeros(abs.toFixed(Number.isInteger(abs) ? 0 : decimals))}`;
}

/** Compact Indian currency for axis labels/legends: "₹10K", "₹1L", "₹2.4Cr". */
export function formatCompactCurrency(value: number, decimals = 1): string {
  return `₹${formatCompactNumber(value, decimals)}`;
}

/** Full Indian digit-grouped currency for tooltips: "₹2,35,400.00". */
export function formatFullCurrency(value: number, decimals = 2): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Full Indian digit-grouped plain number for tooltips: "2,35,400". */
export function formatFullNumber(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** "18%", "-4%"; pass showSign for growth deltas: "+18%". */
export function formatPercent(value: number, opts?: { decimals?: number; showSign?: boolean }): string {
  const decimals = opts?.decimals ?? 0;
  const amount = Number.isFinite(value) ? value : 0;
  const sign = opts?.showSign && amount > 0 ? '+' : '';
  return `${sign}${amount.toFixed(decimals)}%`;
}

export type AxisDateGranularity = 'hour' | 'day' | 'month';

/** Formats an already-labeled bucket string/hour number for axis display. Most of this
 * app's chart data arrives pre-labeled from the API (bucket_label); this covers the one
 * case charts compute client-side — hour-of-day. */
export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
