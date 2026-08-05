import type { EChartsOption } from '../echarts-core';
import { CHART_SERIES, modeFor, type EChartsThemeName } from '../theme';
import { baseLegend, baseTooltip, valueFormatterFor, type ValueAxisFormat } from './shared';

export interface FunnelStageInput {
  name: string;
  value: number;
  color?: string;
}

export interface FunnelOptionInput {
  stages: FunnelStageInput[];
  themeName: EChartsThemeName;
  valueFormat?: ValueAxisFormat;
}

/** Reusable, not yet wired into any dashboard — no conversion-funnel data source
 * exists yet (Sales Funnel / Customer Conversion). Stages sort descending by
 * value automatically; pass them in natural top-to-bottom order. */
export function buildFunnelOption(input: FunnelOptionInput): EChartsOption {
  const { stages, themeName, valueFormat = 'number' } = input;
  const palette = CHART_SERIES[modeFor(themeName)];
  const valueFormatter = valueFormatterFor(valueFormat);
  const max = stages.reduce((m, s) => Math.max(m, s.value), 0) || 1;

  return {
    tooltip: {
      ...baseTooltip('item'),
      formatter: (paramsRaw) => {
        const p = paramsRaw as { marker: string; name: string; value: number; percent: number };
        return `${p.marker} <b>${p.name}</b><br/>${valueFormatter(p.value)} (${p.percent}%)`;
      },
    },
    legend: baseLegend(stages.map((s) => s.name)),
    series: [
      {
        type: 'funnel',
        left: '10%',
        width: '80%',
        top: 24,
        bottom: 24,
        min: 0,
        max,
        sort: 'descending',
        gap: 2,
        label: { show: true, position: 'inside', formatter: '{b}: {d}%' },
        itemStyle: { borderRadius: 4, borderColor: 'transparent', borderWidth: 1 },
        data: stages.map((s, i) => ({
          name: s.name,
          value: s.value,
          itemStyle: { color: s.color ?? palette[i % palette.length] },
        })),
      },
    ],
  };
}
