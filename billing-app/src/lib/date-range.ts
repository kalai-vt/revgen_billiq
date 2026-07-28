export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom_date'
  | 'custom_range';

export interface DateRange {
  from: string; // 'YYYY-MM-DD', tenant-local
  to: string; // 'YYYY-MM-DD', tenant-local
  preset: DateRangePreset;
  label: string;
}

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  last_week: 'Last Week',
  last_7_days: 'Last 7 Days',
  this_month: 'This Month',
  last_month: 'Last Month',
  last_30_days: 'Last 30 Days',
  this_quarter: 'This Quarter',
  last_quarter: 'Last Quarter',
  this_year: 'This Year',
  last_year: 'Last Year',
  custom_date: 'Custom Date',
  custom_range: 'Custom Date Range',
};

export const ALL_PRESETS: DateRangePreset[] = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'last_7_days',
  'this_month',
  'last_month',
  'last_30_days',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'custom_date',
  'custom_range',
];

/** Overview's spec'd preset set (Today/Yesterday/This-and-Last Week/Month/Quarter/Year + Custom
 * Range) — a subset of ALL_PRESETS, omitting the rolling-window presets (Last 7/30 Days) and the
 * single-date custom picker that are specific to Advanced Analytics' broader preset list. */
export const OVERVIEW_PRESETS: DateRangePreset[] = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'custom_range',
];

/** Today's calendar date in an arbitrary IANA timezone, as 'YYYY-MM-DD' — zero-dependency
 * (no date-fns/dayjs/luxon in this project) via the `en-CA` locale, which formats dates as
 * YYYY-MM-DD natively. */
export function tenantLocalToday(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

// All arithmetic below runs on UTC-midnight Date objects built from the tenant-local calendar
// string, never the browser's own local timezone — this avoids the classic off-by-one-day bug
// where `new Date('2026-07-28')` gets interpreted in the viewer's local zone instead of the
// tenant's.
function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(s: string, days: number): string {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return formatISODate(d);
}

function startOfWeekMonday(s: string): string {
  const d = parseISODate(s);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return formatISODate(d);
}

function startOfMonth(s: string): string {
  const d = parseISODate(s);
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

function startOfQuarter(s: string): string {
  const d = parseISODate(s);
  const quarterMonth = Math.floor(d.getUTCMonth() / 3) * 3;
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), quarterMonth, 1)));
}

function startOfYear(s: string): string {
  const d = parseISODate(s);
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), 0, 1)));
}

function lastWeekRange(today: string): { from: string; to: string } {
  const thisWeekStart = startOfWeekMonday(today);
  return { from: addDays(thisWeekStart, -7), to: addDays(thisWeekStart, -1) };
}

function lastMonthRange(today: string): { from: string; to: string } {
  const to = addDays(startOfMonth(today), -1);
  return { from: startOfMonth(to), to };
}

function lastQuarterRange(today: string): { from: string; to: string } {
  const to = addDays(startOfQuarter(today), -1);
  return { from: startOfQuarter(to), to };
}

function lastYearRange(today: string): { from: string; to: string } {
  const to = addDays(startOfYear(today), -1);
  return { from: startOfYear(to), to };
}

function formatDisplayDate(s: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parseISODate(s));
}

export function formatRangeLabel(from: string, to: string): string {
  return from === to ? formatDisplayDate(from) : `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
}

export function resolveDateRangePreset(
  preset: DateRangePreset,
  timezone: string,
  custom?: { from: string; to: string },
): DateRange {
  const today = tenantLocalToday(timezone);
  let from: string;
  let to: string;

  switch (preset) {
    case 'yesterday':
      from = to = addDays(today, -1);
      break;
    case 'this_week':
      from = startOfWeekMonday(today);
      to = today;
      break;
    case 'last_week':
      ({ from, to } = lastWeekRange(today));
      break;
    case 'last_7_days':
      from = addDays(today, -6);
      to = today;
      break;
    case 'this_month':
      from = startOfMonth(today);
      to = today;
      break;
    case 'last_month':
      ({ from, to } = lastMonthRange(today));
      break;
    case 'last_30_days':
      from = addDays(today, -29);
      to = today;
      break;
    case 'this_quarter':
      from = startOfQuarter(today);
      to = today;
      break;
    case 'last_quarter':
      ({ from, to } = lastQuarterRange(today));
      break;
    case 'this_year':
      from = startOfYear(today);
      to = today;
      break;
    case 'last_year':
      ({ from, to } = lastYearRange(today));
      break;
    case 'custom_date':
      from = to = custom?.from ?? today;
      break;
    case 'custom_range':
      from = custom?.from ?? today;
      to = custom?.to ?? today;
      break;
    case 'today':
    default:
      from = to = today;
      break;
  }

  const label = preset === 'custom_date' || preset === 'custom_range' ? formatRangeLabel(from, to) : PRESET_LABELS[preset];
  return { from, to, preset, label };
}
