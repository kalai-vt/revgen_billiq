import type { EChartsOption } from '../echarts-core';
import { buildLineOption, type LineOptionInput } from './buildLineOption';

/** Area chart is a line chart with every series' gradient fill turned on by
 * default — kept as its own named entry point per the chart-type spec, but the
 * geometry (smooth curve, zoom, tooltip) is identical to buildLineOption. */
export function buildAreaOption(input: LineOptionInput): EChartsOption {
  return buildLineOption({
    ...input,
    series: input.series.map((s) => ({ ...s, area: s.area ?? true })),
  });
}
