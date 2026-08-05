import type { EChartsOption } from '../echarts-core';
import { SEQUENTIAL_BLUE, type EChartsThemeName } from '../theme';
import { baseTooltip, computeAxisLabelRotation, valueFormatterFor, type ValueAxisFormat } from './shared';

export interface HeatmapCellInput {
  x: string;
  y: string;
  value: number;
}

export interface HeatmapOptionInput {
  xCategories: string[];
  yCategories: string[];
  cells: HeatmapCellInput[];
  themeName: EChartsThemeName;
  valueFormat?: ValueAxisFormat;
}

interface HeatmapTooltipParam {
  marker: string;
  value: [number, number, number];
}

/** Reusable, not yet wired into any dashboard (see migration scope notes) — a
 * ready-made fit for Hourly/Weekly Sales or Restaurant Peak Hours once that page
 * exists. Sequential single-hue (blue) magnitude scale via visualMap. */
export function buildHeatmapOption(input: HeatmapOptionInput): EChartsOption {
  const { xCategories, yCategories, cells, valueFormat = 'number' } = input;
  const valueFormatter = valueFormatterFor(valueFormat);
  const data = cells.map((c) => [xCategories.indexOf(c.x), yCategories.indexOf(c.y), c.value]);
  const max = cells.reduce((m, c) => Math.max(m, c.value), 0) || 1;

  return {
    tooltip: {
      ...baseTooltip('item'),
      formatter: (paramsRaw: unknown) => {
        const p = paramsRaw as HeatmapTooltipParam;
        const [xi, yi, value] = p.value;
        return `${p.marker} ${yCategories[yi]} · ${xCategories[xi]}<br/><b>${valueFormatter(value)}</b>`;
      },
    },
    grid: { left: 8, right: 16, top: 24, bottom: 56, containLabel: true },
    xAxis: {
      type: 'category',
      data: xCategories,
      splitArea: { show: true },
      axisLabel: { rotate: computeAxisLabelRotation(xCategories), fontSize: 11 },
    },
    yAxis: { type: 'category', data: yCategories, splitArea: { show: true }, axisLabel: { fontSize: 11 } },
    visualMap: {
      min: 0,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: [...SEQUENTIAL_BLUE] },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: { show: false },
        itemStyle: { borderRadius: 2, borderColor: 'transparent', borderWidth: 2 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.25)' } },
      },
    ],
  } as EChartsOption;
}
