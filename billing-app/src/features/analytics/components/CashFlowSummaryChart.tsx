import { useMemo, useRef } from 'react';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ChartExportFormat, ExportFormat } from '@/components/shared/ExportDropdown';
import { BaseEChart, type BaseEChartHandle } from '@/lib/echarts/BaseEChart';
import { useEChartsTheme } from '@/lib/echarts/useEChartsTheme';
import { CHART_SURFACE, modeFor } from '@/lib/echarts/theme';
import { formatFullCurrency } from '@/lib/echarts/formatters';
import { buildBarOption } from '@/lib/echarts/options';
import { exportChartAsPng } from '@/lib/echarts/exportImage';
import { exportChartDataAsCsv } from '@/lib/echarts/exportCsv';
import type { CashFlowSummary } from '@/features/analytics/api';

interface CashFlowSummaryChartProps {
  data: CashFlowSummary;
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function CashFlowSummaryChart({ data, isLoading, onExport }: CashFlowSummaryChartProps) {
  const chartRef = useRef<BaseEChartHandle>(null);
  const themeName = useEChartsTheme();

  const option = useMemo(
    () =>
      buildBarOption({
        categories: data.daily.map((d) => d.bucket_label),
        series: [{ name: 'Cash In', values: data.daily.map((d) => d.amount) }],
        themeName,
        valueFormat: 'currency',
      }),
    [data.daily, themeName]
  );

  function handleExport(format: ChartExportFormat) {
    if (format === 'image_png') {
      exportChartAsPng(chartRef.current?.getInstance(), 'cash-flow-summary', CHART_SURFACE[modeFor(themeName)]);
      return;
    }
    if (format === 'data_csv') {
      exportChartDataAsCsv(
        data.daily,
        [
          { key: 'bucket_label', label: 'Period' },
          { key: 'amount', label: 'Cash In' },
        ],
        'cash-flow-summary'
      );
      return;
    }
    onExport(format);
  }

  return (
    <ChartCard
      title="Cash Flow Summary"
      isLoading={isLoading}
      isEmpty={data.daily.length === 0}
      onExport={handleExport}
      exportFormats={['excel', 'pdf', 'csv', 'image_png', 'data_csv']}
    >
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-muted-foreground">Total Cash In</p>
          <p className="text-lg font-semibold tracking-tight">{formatFullCurrency(data.total_cash_in)}</p>
        </div>
        <div className="min-h-0 flex-1">
          <BaseEChart ref={chartRef} option={option} />
        </div>
      </div>
    </ChartCard>
  );
}
