import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildBarOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { TopProduct } from '@/features/analytics/api';

interface TopProductsChartProps {
  data: TopProduct[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function TopProductsChart({ data, isLoading, onExport }: TopProductsChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildBarOption({
        categories: data.map((d) => d.name),
        series: [{ name: 'Qty Sold', values: data.map((d) => d.qty_sold) }],
        themeName,
        valueFormat: 'number',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'top-products', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'name', label: 'Product' },
          { key: 'identifier_value', label: 'Identifier' },
          { key: 'qty_sold', label: 'Qty Sold' },
          { key: 'revenue', label: 'Revenue' },
        ],
        'top-products'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Top Selling Products"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
