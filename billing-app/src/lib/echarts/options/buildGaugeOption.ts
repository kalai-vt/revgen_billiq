import type { EChartsOption } from '../echarts-core';
import { CHART_INK, CHART_PRIMARY, modeFor, type EChartsThemeName } from '../theme';
import { valueFormatterFor, type ValueAxisFormat } from './shared';

export interface GaugeOptionInput {
  value: number;
  min?: number;
  max: number;
  themeName: EChartsThemeName;
  valueFormat?: ValueAxisFormat;
  title?: string;
}

/** Reusable, not yet wired into any dashboard — no target/achievement data source
 * exists yet (Revenue Target / Monthly Achievement / Sales Goal). `value`/`max`
 * are in the same units (e.g. both rupees, or both a 0-100 percent-of-target). */
export function buildGaugeOption(input: GaugeOptionInput): EChartsOption {
  const { value, min = 0, max, themeName, valueFormat = 'percent', title } = input;
  const mode = modeFor(themeName);
  const ink = CHART_INK[mode];
  const primary = CHART_PRIMARY[mode];
  const valueFormatter = valueFormatterFor(valueFormat);

  return {
    series: [
      {
        type: 'gauge',
        min,
        max,
        startAngle: 200,
        endAngle: -20,
        progress: { show: true, width: 14, itemStyle: { color: primary } },
        axisLine: { lineStyle: { width: 14, color: [[1, ink.border]] } },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: Boolean(title), offsetCenter: [0, '32%'], color: ink.secondary, fontSize: 12 },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, 0],
          formatter: (v: number) => valueFormatter(v),
          color: ink.primary,
          fontSize: 22,
          fontWeight: 600,
        },
        data: [{ value, name: title ?? '' }],
      },
    ],
  };
}
