import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { formatHourLabel } from '@/lib/echarts/formatters';
import { buildBarOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { HourlyPoint } from '@/features/analytics/api';

interface HourlySalesChartProps {
  data: HourlyPoint[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function HourlySalesChart({ data, isLoading, onExport }: HourlySalesChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();
  const hasSales = data.some((point) => point.order_count > 0);

  const option = useMemo(
    () =>
      buildBarOption({
        categories: data.map((d) => formatHourLabel(d.hour)),
        series: [{ name: 'Revenue', values: data.map((d) => d.revenue) }],
        themeName,
        valueFormat: 'currency',
        dataZoomKind: 'time-series',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'hourly-sales', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'hour', label: 'Hour' },
          { key: 'revenue', label: 'Revenue' },
          { key: 'order_count', label: 'Orders' },
        ],
        'hourly-sales'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Hourly Sales"
      isLoading={isLoading}
      isEmpty={data.length === 0 || !hasSales}
      emptyLabel="Hourly sales are only shown when a single day is selected."
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
