import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { TaxBreakdownRow } from '@/features/analytics/api';

interface TaxBreakdownChartProps {
  data: TaxBreakdownRow[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function TaxBreakdownChart({ data, isLoading, onExport }: TaxBreakdownChartProps) {
  const chartData = data.map((row) => ({ ...row, label: `${row.tax_rate_percent}%` }));

  return (
    <ChartCard title="Tax Breakdown" isLoading={isLoading} isEmpty={data.length === 0} onExport={onExport}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip formatter={(value) => Number(value).toFixed(2)} />
          <Bar dataKey="tax_amount" name="Tax Collected" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
