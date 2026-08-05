import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildAreaOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { TrendPoint } from '@/features/analytics/api';

interface SalesTrendChartProps {
  data: TrendPoint[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function SalesTrendChart({ data, isLoading, onExport }: SalesTrendChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildAreaOption({
        categories: data.map((d) => d.bucket_label),
        series: [{ name: 'Revenue', values: data.map((d) => d.revenue), showAverage: true }],
        themeName,
        valueFormat: 'currency',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'sales-trend', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'bucket_label', label: 'Period' },
          { key: 'revenue', label: 'Revenue' },
          { key: 'order_count', label: 'Orders' },
        ],
        'sales-trend'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Sales Trend"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
