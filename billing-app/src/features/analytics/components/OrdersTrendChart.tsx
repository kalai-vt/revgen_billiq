import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildBarOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { TrendPoint } from '@/features/analytics/api';

interface OrdersTrendChartProps {
  data: TrendPoint[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function OrdersTrendChart({ data, isLoading, onExport }: OrdersTrendChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildBarOption({
        categories: data.map((d) => d.bucket_label),
        series: [{ name: 'Orders', values: data.map((d) => d.order_count) }],
        themeName,
        valueFormat: 'number',
        allowDecimals: false,
        dataZoomKind: 'time-series',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'orders-trend', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'bucket_label', label: 'Period' },
          { key: 'order_count', label: 'Orders' },
          { key: 'revenue', label: 'Revenue' },
        ],
        'orders-trend'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Orders Trend"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
