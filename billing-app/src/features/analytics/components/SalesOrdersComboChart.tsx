import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildComboOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { TrendPoint } from '@/features/analytics/api';

interface SalesOrdersComboChartProps {
  data: TrendPoint[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

/** Revenue (bar, left axis) + order count (line, right axis) in one combo chart — the Overview
 * spec explicitly asks for this dual-metric view, a deliberate exception to keeping charts
 * single-axis everywhere else in this app. */
export function SalesOrdersComboChart({ data, isLoading, onExport }: SalesOrdersComboChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildComboOption({
        categories: data.map((d) => d.bucket_label),
        themeName,
        bar: { name: 'Revenue', values: data.map((d) => d.revenue), valueFormat: 'currency' },
        line: { name: 'Orders', values: data.map((d) => d.order_count), valueFormat: 'number', allowDecimals: false },
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'revenue-and-orders', CHART_SURFACE[modeFor(themeName)]);
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
        'revenue-and-orders'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Revenue & Orders"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
