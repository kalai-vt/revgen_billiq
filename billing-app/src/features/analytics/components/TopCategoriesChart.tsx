import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildBarOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { TopCategory } from '@/features/analytics/api';

interface TopCategoriesChartProps {
  data: TopCategory[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function TopCategoriesChart({ data, isLoading, onExport }: TopCategoriesChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildBarOption({
        categories: data.map((d) => d.name),
        series: [{ name: 'Revenue', values: data.map((d) => d.revenue) }],
        themeName,
        valueFormat: 'currency',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'top-categories', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'name', label: 'Category' },
          { key: 'revenue', label: 'Revenue' },
          { key: 'qty_sold', label: 'Qty Sold' },
        ],
        'top-categories'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Top Categories"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
