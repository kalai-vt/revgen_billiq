import type { EChartsOption } from '../echarts-core';
import { CHART_SERIES, modeFor, type EChartsThemeName } from '../theme';
import { shouldEnableDataZoom, type DataZoomKind } from '../dataZoom';
import {
  baseGrid,
  baseLegend,
  baseTooltip,
  categoryAxis,
  formatCompactAxisValue,
  valueFormatterFor,
  verticalBarGradient,
  withDataZoom,
  type ValueAxisFormat,
} from './shared';

interface ComboSeriesInput {
  name: string;
  values: number[];
  color?: string;
  valueFormat?: ValueAxisFormat;
  allowDecimals?: boolean;
}

export interface ComboOptionInput {
  categories: string[];
  themeName: EChartsThemeName;
  bar: ComboSeriesInput;
  line: ComboSeriesInput;
  dataZoomKind?: DataZoomKind;
}

interface AxisTooltipParam {
  marker: string;
  seriesName: string;
  value: number;
  axisValueLabel: string;
}

/** Dual-axis bar+line combo — a deliberate, documented exception to "never
 * dual-axis" (see SalesOrdersComboChart's own comment): the product spec
 * explicitly calls for Revenue+Orders on one chart. Each axis/series keeps its
 * own value format (currency vs plain count) throughout, including the tooltip. */
export function buildComboOption(input: ComboOptionInput): EChartsOption {
  const { categories, themeName, bar, line, dataZoomKind = 'time-series' } = input;
  const palette = CHART_SERIES[modeFor(themeName)];
  const barColor = bar.color ?? palette[0];
  const lineColor = line.color ?? palette[3];
  const barFormat = bar.valueFormat ?? 'currency';
  const lineFormat = line.valueFormat ?? 'number';
  const barValueFormatter = valueFormatterFor(barFormat);
  const lineValueFormatter = valueFormatterFor(lineFormat);

  const dataZoomOn = shouldEnableDataZoom(categories.length, dataZoomKind);

  const option = {
    grid: baseGrid({ withLegend: true, withDataZoom: dataZoomOn }),
    tooltip: {
      ...baseTooltip('axis'),
      formatter: (paramsRaw: unknown) => {
        const params = paramsRaw as AxisTooltipParam[];
        const rows = params
          .map((p) => {
            const formatter = p.seriesName === bar.name ? barValueFormatter : lineValueFormatter;
            return `${p.marker} ${p.seriesName}: <b>${formatter(p.value)}</b>`;
          })
          .join('<br/>');
        return `${params[0]?.axisValueLabel ?? ''}<br/>${rows}`;
      },
    },
    legend: baseLegend([bar.name, line.name], { withDataZoom: dataZoomOn }),
    xAxis: categoryAxis(categories),
    yAxis: [
      {
        type: 'value',
        name: bar.name,
        axisLabel: { fontSize: 11, formatter: (v: number) => formatCompactAxisValue(v, barFormat) },
        splitLine: { show: true },
      },
      {
        type: 'value',
        name: line.name,
        position: 'right',
        axisLabel: { fontSize: 11, formatter: (v: number) => formatCompactAxisValue(v, lineFormat) },
        minInterval: line.allowDecimals === false ? 1 : undefined,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        type: 'bar',
        name: bar.name,
        yAxisIndex: 0,
        data: bar.values,
        barMaxWidth: 40,
        itemStyle: { color: verticalBarGradient(barColor), borderRadius: [4, 4, 0, 0] },
        emphasis: { focus: 'series' },
      },
      {
        type: 'line',
        name: line.name,
        yAxisIndex: 1,
        data: line.values,
        smooth: true,
        showSymbol: false,
        symbol: 'circle',
        lineStyle: { width: 2, color: lineColor },
        itemStyle: { color: lineColor },
        emphasis: { focus: 'series' },
      },
    ],
  } as EChartsOption;

  return withDataZoom(option, categories.length, dataZoomKind, { withLegend: true });
}
