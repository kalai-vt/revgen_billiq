import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { buildBarOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { TaxBreakdownRow } from '@/features/analytics/api';

interface TaxBreakdownChartProps {
  data: TaxBreakdownRow[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function TaxBreakdownChart({ data, isLoading, onExport }: TaxBreakdownChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildBarOption({
        categories: data.map((d) => `${d.tax_rate_percent}%`),
        series: [{ name: 'Tax Collected', values: data.map((d) => d.tax_amount) }],
        themeName,
        valueFormat: 'currency',
      }),
    [data, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'tax-breakdown', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data,
        [
          { key: 'tax_rate_percent', label: 'Tax Rate %' },
          { key: 'taxable_amount', label: 'Taxable Amount' },
          { key: 'tax_amount', label: 'Tax Collected' },
        ],
        'tax-breakdown'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Tax Breakdown"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <BaseEChart ref={chartRef} option={option} />
    </ChartCard>
  );
}
