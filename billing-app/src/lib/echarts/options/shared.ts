// Shared option fragments so every chart gets the same axis-label collision
// handling, tooltip styling, legend behavior, and grid spacing without each
// `build*Option` re-deriving it. Pure — no React/echarts-instance access.
import echarts, { type EChartsOption } from '../echarts-core';
import { formatCompactNumber, formatFullCurrency, formatFullNumber, formatPercent } from '../formatters';
import { hexToRgba } from '../theme';
import { shouldEnableDataZoom, buildDataZoom, type DataZoomKind } from '../dataZoom';

/** Grid auto-adjusts to axis label length via `containLabel`; bottom grows to make
 * room for a docked legend and/or a dataZoom slider so neither overlaps the x-axis
 * labels — both are additive since a wide multi-series time-range chart can have both. */
export function baseGrid(opts?: { withDataZoom?: boolean; withLegend?: boolean }): AxisOption {
  let bottom = 8;
  if (opts?.withLegend) bottom += 28;
  if (opts?.withDataZoom) bottom += 40;
  return {
    // Floors, not fixed sizes — `containLabel: true` grows them further as needed.
    // Kept above single-digit px so a rotated label anchored at a boundaryGap:false
    // series' first/last point (see buildLineOption) has room before it's clipped
    // by the card's own overflow, not just by the plot area.
    left: 16,
    right: 20,
    top: 28,
    bottom,
    containLabel: true,
  };
}

/** Rotate long/dense category labels 30-45deg; short, sparse ones stay horizontal.
 * Overlap that remains after rotation is hidden (not overlapped) — the tooltip
 * always shows the untruncated category name regardless of what's visible on-axis. */
export function computeAxisLabelRotation(categories: string[]): number {
  const maxLen = categories.reduce((max, c) => Math.max(max, c.length), 0);
  if (categories.length > 10 || maxLen > 12) return 45;
  if (categories.length > 6 || maxLen > 6) return 30;
  return 0;
}

// ECharts' xAxis/yAxis option type is a large discriminated union (category/value/
// time/log, single or array) that resists incremental composition — TS re-checks
// the discriminant against the *consuming* object literal's context, not the
// return statement here. These helpers return a deliberately loose shape; each
// `build*Option` casts its finished, whole option object to `EChartsOption` once
// at the return boundary instead of fighting the union at every field.
export type AxisOption = Record<string, unknown>;

export function categoryAxis(categories: string[], opts?: { boundaryGap?: boolean; intervalStep?: number }): AxisOption {
  const rotate = computeAxisLabelRotation(categories);
  return {
    type: 'category',
    data: categories,
    boundaryGap: opts?.boundaryGap,
    axisLabel: {
      rotate,
      hideOverlap: true,
      interval: opts?.intervalStep ?? 'auto',
      fontSize: 11,
    },
  };
}

export type ValueAxisFormat = 'currency' | 'number' | 'percent';

/** Compact axis-label text for a raw value: "₹10K" / "50%" / "1.2L". */
export function formatCompactAxisValue(value: number, format: ValueAxisFormat): string {
  if (format === 'currency') return `₹${formatCompactNumber(value)}`;
  if (format === 'percent') return `${value}%`;
  return formatCompactNumber(value);
}

export function valueAxis(format: ValueAxisFormat = 'number', opts?: { allowDecimals?: boolean }): AxisOption {
  return {
    type: 'value',
    axisLabel: {
      fontSize: 11,
      formatter: (value: number) => formatCompactAxisValue(value, format),
    },
    minInterval: opts?.allowDecimals === false ? 1 : undefined,
    splitLine: { show: true },
  };
}

/** Crosshair tooltip; `kind: 'axis'` for bar/line/combo, `'item'` for pie. Individual
 * series values are formatted by the caller via each series' own `valueFormatter`
 * passed through `params` — this only sets trigger/pointer/shared shell behavior. */
export function baseTooltip(kind: 'axis' | 'item'): AxisOption {
  return {
    trigger: kind,
    axisPointer: kind === 'axis' ? { type: 'cross', label: { backgroundColor: '#6a7985' } } : undefined,
    confine: true,
  };
}

export function baseLegend(names: string[], opts?: { withDataZoom?: boolean }): AxisOption {
  return {
    data: names,
    type: names.length > 6 ? 'scroll' : 'plain',
    // Sits above the dataZoom slider (which docks at its own `bottom: 4`, `height: 18`)
    // when both are present, instead of both fighting for the same bottom:0 row.
    bottom: opts?.withDataZoom ? 34 : 0,
    icon: 'roundRect',
    itemGap: 16,
    itemWidth: 10,
    itemHeight: 10,
  };
}

export const BASE_ANIMATION = {
  animation: true,
  animationDuration: 400,
  animationDurationUpdate: 350,
  animationEasing: 'cubicOut',
} as const;

/** Applies the single app-wide dataZoom rule (see dataZoom.ts) to an option that
 * already has an x-axis; no-op below the point threshold or for categorical data.
 * `withLegend` should mirror whether the caller already attached a legend, so the
 * recomputed grid still reserves room for it alongside the new slider. */
export function withDataZoom(option: EChartsOption, pointCount: number, kind: DataZoomKind, opts?: { withLegend?: boolean }): EChartsOption {
  if (!shouldEnableDataZoom(pointCount, kind)) return option;
  return {
    ...option,
    dataZoom: buildDataZoom(),
    grid: baseGrid({ withDataZoom: true, withLegend: opts?.withLegend }),
  } as EChartsOption;
}

export function valueFormatterFor(format: ValueAxisFormat) {
  return (value: number) =>
    format === 'currency' ? formatFullCurrency(value) : format === 'percent' ? formatPercent(value) : formatFullNumber(value);
}

/** Top-to-bottom gradient (opaque -> 15% alpha) from a flat series color, for bar fills. */
export function verticalBarGradient(color: string) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color },
    { offset: 1, color: hexToRgba(color, 0.35) },
  ]);
}

/** Top-to-bottom gradient (35% alpha -> transparent) from a flat series color, for area fills. */
export function verticalAreaGradient(color: string) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: hexToRgba(color, 0.35) },
    { offset: 1, color: hexToRgba(color, 0.02) },
  ]);
}
