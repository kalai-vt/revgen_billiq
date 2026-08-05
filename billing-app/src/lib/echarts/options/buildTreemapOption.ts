import type { EChartsOption } from '../echarts-core';
import { CHART_SERIES, modeFor, type EChartsThemeName } from '../theme';
import { valueFormatterFor, type ValueAxisFormat } from './shared';

export interface TreemapNodeInput {
  name: string;
  value: number;
  color?: string;
  children?: TreemapNodeInput[];
}

export interface TreemapOptionInput {
  data: TreemapNodeInput[];
  themeName: EChartsThemeName;
  valueFormat?: ValueAxisFormat;
}

interface TreemapTooltipParam {
  name: string;
  value: number;
}

function mapNode(node: TreemapNodeInput): Record<string, unknown> {
  return {
    name: node.name,
    value: node.value,
    itemStyle: node.color ? { color: node.color } : undefined,
    children: node.children?.map(mapNode),
  };
}

/** Reusable, not yet wired into any dashboard — a fit for Category Sales/Product
 * Revenue once that page exists, without changing TopCategoriesChart/
 * TopProductsChart's current bar layout. */
export function buildTreemapOption(input: TreemapOptionInput): EChartsOption {
  const { data, themeName, valueFormat = 'currency' } = input;
  const palette = CHART_SERIES[modeFor(themeName)];
  const valueFormatter = valueFormatterFor(valueFormat);

  return {
    tooltip: {
      formatter: (paramsRaw: unknown) => {
        const p = paramsRaw as TreemapTooltipParam;
        return `<b>${p.name}</b><br/>${valueFormatter(p.value)}`;
      },
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: { show: true },
        itemStyle: { borderRadius: 4, gapWidth: 2 },
        label: { show: true, formatter: '{b}' },
        colorMappingBy: 'index',
        color: [...palette],
        data: data.map(mapNode),
      },
    ],
  } as EChartsOption;
}
