import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { formatCompactCurrency } from '@/lib/echarts/formatters';
import { buildPieOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { PaymentMethodBreakdown } from '@/features/analytics/api';

interface PaymentMethodsChartProps {
  data: PaymentMethodBreakdown[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function PaymentMethodsChart({ data, isLoading, onExport }: PaymentMethodsChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildPieOption({
        slices: data.map((d) => ({ name: d.method.toUpperCase(), value: d.amount })),
        themeName,
        valueFormat: 'currency',
        centerLabel: { title: 'Total', formatter: formatCompactCurrency },
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'payment-methods', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'method', label: 'Method' },
          { key: 'amount', label: 'Amount' },
          { key: 'count', label: 'Count' },
        ],
        'payment-methods'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Payment Methods"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
