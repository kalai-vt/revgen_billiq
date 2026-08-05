import type { EChartsOption } from '../echarts-core';
import { CHART_SERIES } from '../theme';
import type { EChartsThemeName } from '../theme';
import { modeFor } from '../theme';
import { shouldEnableDataZoom, type DataZoomKind } from '../dataZoom';
import {
  baseGrid,
  baseLegend,
  baseTooltip,
  categoryAxis,
  valueAxis,
  valueFormatterFor,
  verticalBarGradient,
  withDataZoom,
  type ValueAxisFormat,
} from './shared';

export interface BarSeriesInput {
  name: string;
  values: number[];
  color?: string;
}

export interface BarOptionInput {
  categories: string[];
  series: BarSeriesInput[];
  themeName: EChartsThemeName;
  valueFormat?: ValueAxisFormat;
  allowDecimals?: boolean;
  variant?: 'grouped' | 'stacked' | 'horizontal';
  gradient?: boolean;
  dataZoomKind?: DataZoomKind;
}

/** Bar chart: rounded corners, optional gradient fill, grouped/stacked/horizontal
 * variants, dataZoom applied per the app-wide density rule. Single-series bar
 * charts (the common case here) get the palette's brand-purple primary by default. */
export function buildBarOption(input: BarOptionInput): EChartsOption {
  const {
    categories,
    series,
    themeName,
    valueFormat = 'number',
    allowDecimals = true,
    variant = 'grouped',
    gradient = true,
    dataZoomKind = 'categorical',
  } = input;

  const palette = CHART_SERIES[modeFor(themeName)];
  const horizontal = variant === 'horizontal';
  const stack = variant === 'stacked' ? 'total' : undefined;
  const valueFormatter = valueFormatterFor(valueFormat);

  const echartsSeries = series.map((s, i) => {
    const color = s.color ?? palette[i % palette.length];
    return {
      type: 'bar' as const,
      name: s.name,
      data: s.values,
      stack,
      barMaxWidth: 48,
      itemStyle: {
        color: gradient ? verticalBarGradient(color) : color,
        borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
      },
      emphasis: { focus: 'series' as const },
    };
  });

  const hasLegend = series.length > 1;
  const dataZoomOn = shouldEnableDataZoom(categories.length, dataZoomKind);

  const option = {
    grid: baseGrid({ withLegend: hasLegend, withDataZoom: dataZoomOn }),
    tooltip: { ...baseTooltip('axis'), valueFormatter },
    legend: hasLegend ? baseLegend(series.map((s) => s.name), { withDataZoom: dataZoomOn }) : undefined,
    xAxis: horizontal ? valueAxis(valueFormat, { allowDecimals }) : categoryAxis(categories),
    yAxis: horizontal ? categoryAxis(categories) : valueAxis(valueFormat, { allowDecimals }),
    series: echartsSeries,
  } as EChartsOption;

  return withDataZoom(option, categories.length, dataZoomKind, { withLegend: hasLegend });
}
