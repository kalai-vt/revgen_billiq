import type { EChartsOption } from '../echarts-core';
import { CHART_INK, CHART_SERIES, modeFor, type EChartsThemeName } from '../theme';
import { baseLegend, baseTooltip, valueFormatterFor, type ValueAxisFormat } from './shared';

export interface PieSliceInput {
  name: string;
  value: number;
  color?: string;
}

export interface PieOptionInput {
  slices: PieSliceInput[];
  themeName: EChartsThemeName;
  valueFormat?: ValueAxisFormat;
  /** Shows a total in the doughnut's hole, e.g. { title: 'Total', formatter: formatCompactCurrency }. */
  centerLabel?: { title: string; formatter: (total: number) => string };
  doughnut?: boolean;
}

/** Pie/doughnut: center total label, hover emphasis with percentage, click-to-select
 * (pops the slice out), legend hide/show, custom per-slice colors. */
export function buildPieOption(input: PieOptionInput): EChartsOption {
  const { slices, themeName, valueFormat = 'currency', centerLabel, doughnut = true } = input;
  const mode = modeFor(themeName);
  const palette = CHART_SERIES[mode];
  const ink = CHART_INK[mode];
  const valueFormatter = valueFormatterFor(valueFormat);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const option: EChartsOption = {
    tooltip: {
      ...baseTooltip('item'),
      formatter: (params) => {
        const p = params as { marker: string; name: string; value: number; percent: number };
        return `${p.marker} <b>${p.name}</b><br/>${valueFormatter(p.value)} (${p.percent}%)`;
      },
    },
    legend: baseLegend(slices.map((s) => s.name)),
    series: [
      {
        type: 'pie',
        radius: doughnut ? ['55%', '75%'] : '75%',
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        selectedMode: 'single',
        selectedOffset: 8,
        itemStyle: { borderRadius: 4, borderColor: 'transparent', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scaleSize: 6,
          label: { show: true, fontSize: 13, fontWeight: 600, formatter: '{b}\n{d}%' },
        },
        data: slices.map((s, i) => ({
          name: s.name,
          value: s.value,
          itemStyle: { color: s.color ?? palette[i % palette.length] },
        })),
      },
    ],
    graphic:
      doughnut && centerLabel
        ? [
            {
              type: 'text',
              left: 'center',
              top: '38%',
              style: { text: centerLabel.title, fill: ink.secondary, fontSize: 11 },
            },
            {
              type: 'text',
              left: 'center',
              top: '43%',
              style: { text: centerLabel.formatter(total), fill: ink.primary, fontSize: 17, fontWeight: 600 },
            },
          ]
        : undefined,
  };

  return option;
}
