import type { EChartsOption } from '../echarts-core';
import { CHART_SERIES, modeFor, type EChartsThemeName } from '../theme';
import { shouldEnableDataZoom, type DataZoomKind } from '../dataZoom';
import {
  baseGrid,
  baseLegend,
  baseTooltip,
  categoryAxis,
  valueAxis,
  valueFormatterFor,
  verticalAreaGradient,
  withDataZoom,
  type ValueAxisFormat,
} from './shared';

export interface LineSeriesInput {
  name: string;
  values: number[];
  color?: string;
  /** Gradient-filled area under the line (used by buildAreaOption). */
  area?: boolean;
  /** Adds an average reference line + label for this series. */
  showAverage?: boolean;
  /** Marks the series' min/max points. */
  markMinMax?: boolean;
}

export interface LineOptionInput {
  categories: string[];
  series: LineSeriesInput[];
  themeName: EChartsThemeName;
  valueFormat?: ValueAxisFormat;
  allowDecimals?: boolean;
  smooth?: boolean;
  dataZoomKind?: DataZoomKind;
}

/** Line chart: smooth curves, optional gradient area, mark points/average line,
 * multi-series with legend hide/show/highlight. */
export function buildLineOption(input: LineOptionInput): EChartsOption {
  const { categories, series, themeName, valueFormat = 'number', allowDecimals = true, smooth = true, dataZoomKind = 'time-series' } = input;

  const palette = CHART_SERIES[modeFor(themeName)];
  const valueFormatter = valueFormatterFor(valueFormat);

  const echartsSeries = series.map((s, i) => {
    const color = s.color ?? palette[i % palette.length];
    return {
      type: 'line' as const,
      name: s.name,
      data: s.values,
      smooth,
      symbol: 'circle',
      symbolSize: 6,
      showSymbol: false,
      lineStyle: { width: 2, color },
      itemStyle: { color },
      areaStyle: s.area ? { color: verticalAreaGradient(color) } : undefined,
      emphasis: { focus: 'series' as const },
      markPoint: s.markMinMax
        ? { symbolSize: 44, data: [{ type: 'max' as const, name: 'Max' }, { type: 'min' as const, name: 'Min' }] }
        : undefined,
      markLine: s.showAverage
        ? {
            symbol: 'none' as const,
            data: [{ type: 'average' as const, name: 'Average' }],
            // Default label position ('end') sits past the grid's right edge on a
            // short series and gets clipped by the card; 'insideEndTop' keeps it
            // inside the plot area regardless of series length.
            label: { formatter: '{b}: {c}', position: 'insideEndTop' as const },
          }
        : undefined,
    };
  });

  const hasLegend = series.length > 1;
  const dataZoomOn = shouldEnableDataZoom(categories.length, dataZoomKind);

  const option = {
    grid: baseGrid({ withLegend: hasLegend, withDataZoom: dataZoomOn }),
    tooltip: { ...baseTooltip('axis'), valueFormatter },
    legend: hasLegend ? baseLegend(series.map((s) => s.name), { withDataZoom: dataZoomOn }) : undefined,
    xAxis: categoryAxis(categories, { boundaryGap: false }),
    yAxis: valueAxis(valueFormat, { allowDecimals }),
    series: echartsSeries,
  } as EChartsOption;

  return withDataZoom(option, categories.length, dataZoomKind, { withLegend: hasLegend });
}
